import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { apiUsage, youcamFiles } from "@/lib/db/schema";
import {
  createTask,
  deleteTask,
  getRemainingUnits,
  getTask,
  isMockMode,
  isTrustedResultUrl,
  uploadImage,
  YouCamError,
} from "./client";
import { isMockTaskId, mockTaskId, mockTaskResult } from "./mock";
import { FEATURE_UNITS, type HairColorResults, type TaskResult, type YouCamFeature } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_UNITS_PER_USER = Number(process.env.YOUCAM_DAILY_UNITS_PER_USER ?? 80);
const MIN_REMAINING_UNITS = Number(process.env.YOUCAM_MIN_REMAINING_UNITS ?? 60);
const BALANCE_CACHE_MS = 60_000;
const MAX_RENDER_BYTES = 10 * 1024 * 1024;

let balanceCache: { value: number; at: number } | null = null;

async function remainingUnits(): Promise<number> {
  if (balanceCache && Date.now() - balanceCache.at < BALANCE_CACHE_MS) return balanceCache.value;
  const value = await getRemainingUnits();
  balanceCache = { value, at: Date.now() };
  return value;
}

/** Units this user spent (or has in flight) in the last 24 hours. */
export async function unitsUsedToday(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${apiUsage.units}), 0)` })
    .from(apiUsage)
    .where(
      and(
        eq(apiUsage.userId, userId),
        eq(apiUsage.mock, false),
        gte(apiUsage.createdAt, new Date(Date.now() - DAY_MS)),
        sql`${apiUsage.status} != 'error'`,
      ),
    );
  return Number(row?.total ?? 0);
}

export function isMockFileId(fileId: string): boolean {
  return fileId.startsWith("mock_");
}

/** Uploads a photo to YouCam's File API and remembers that this user owns the file id. */
export async function uploadForUser(userId: string, bytes: ArrayBuffer, contentType: string): Promise<{ fileId: string; mock: boolean }> {
  if (isMockMode()) return { fileId: `mock_file_${crypto.randomUUID()}`, mock: true };
  const ext = contentType === "image/png" ? "png" : "jpg";
  const fileId = await uploadImage(bytes, contentType, `dyecast_${Date.now()}.${ext}`);
  await db.insert(youcamFiles).values({ fileId, userId, createdAt: new Date() });
  return { fileId, mock: false };
}

/** Render requests may only reference files the caller uploaded (YouCam keeps files for 30 days). */
export async function userOwnsFile(userId: string, fileId: string): Promise<boolean> {
  if (isMockFileId(fileId)) return true;
  const [row] = await db
    .select({ fileId: youcamFiles.fileId })
    .from(youcamFiles)
    .where(
      and(
        eq(youcamFiles.fileId, fileId),
        eq(youcamFiles.userId, userId),
        gte(youcamFiles.createdAt, new Date(Date.now() - 25 * DAY_MS)),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Starts a task after checking the user's daily budget and the account's remaining balance. */
export async function startTask(
  userId: string,
  feature: YouCamFeature,
  body: Record<string, unknown>,
): Promise<{ taskId: string; mock: boolean }> {
  const units = FEATURE_UNITS[feature];
  const mock = isMockMode() || isMockFileId(String(body.src_file_id ?? ""));
  if (!mock) {
    if ((await unitsUsedToday(userId)) + units > DAILY_UNITS_PER_USER) {
      throw new YouCamError(
        "You've reached today's photo analysis limit. Try again tomorrow — color forecasts still work.",
        "daily_budget",
        429,
      );
    }
    if ((await remainingUnits()) - units < MIN_REMAINING_UNITS) {
      throw new YouCamError("Live photo analysis is paused to protect the demo budget. Color forecasts still work.", "global_floor", 503);
    }
  }
  const taskId = mock ? mockTaskId(feature) : await createTask(feature, body);
  await db.insert(apiUsage).values({
    id: crypto.randomUUID(),
    userId,
    feature,
    units: mock ? 0 : units,
    taskId,
    status: "created",
    mock,
    createdAt: new Date(),
  });
  return { taskId, mock };
}

/**
 * Polls a task the user owns and records the final status. Render URLs stay server-side;
 * the browser receives render images only through {@link takeRender}.
 */
export async function pollTask<T>(userId: string, feature: YouCamFeature, taskId: string): Promise<TaskResult<T>> {
  const [usage] = await db
    .select()
    .from(apiUsage)
    .where(and(eq(apiUsage.taskId, taskId), eq(apiUsage.userId, userId), eq(apiUsage.feature, feature)))
    .limit(1);
  if (!usage) throw new YouCamError("Task not found.", "task_not_found", 404);

  const result = isMockTaskId(taskId) ? mockTaskResult<T>(feature) : await getTask<T>(feature, taskId);
  if (result.status !== "running" && usage.status === "created") {
    const renderUrl =
      feature === "hair-color" && result.status === "success"
        ? (result.results as HairColorResults | undefined)?.url
        : undefined;
    await db
      .update(apiUsage)
      .set({
        status: result.status,
        units: result.status === "error" ? 0 : usage.units,
        resultUrl: renderUrl && isTrustedResultUrl(renderUrl) ? renderUrl : null,
      })
      .where(eq(apiUsage.id, usage.id));
  }
  if (feature === "hair-color") return { ...result, results: undefined };
  return result;
}

/** Downloads a finished render once, then forgets its URL. Returns null for mock renders. */
export async function takeRender(userId: string, taskId: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const [usage] = await db
    .select()
    .from(apiUsage)
    .where(and(eq(apiUsage.taskId, taskId), eq(apiUsage.userId, userId), eq(apiUsage.feature, "hair-color")))
    .limit(1);
  if (!usage) throw new YouCamError("Render not found.", "task_not_found", 404);
  if (usage.mock) return null;
  if (!usage.resultUrl || !isTrustedResultUrl(usage.resultUrl)) {
    throw new YouCamError("This render is no longer available. Run the preview again.", "render_gone", 410);
  }
  const res = await fetch(usage.resultUrl, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(contentType)) {
    throw new YouCamError("The render could not be downloaded.", "render_download", 502, true);
  }
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_RENDER_BYTES) throw new YouCamError("The render is too large.", "render_size", 502);
  await db.update(apiUsage).set({ resultUrl: null }).where(eq(apiUsage.id, usage.id));
  return { bytes, contentType };
}

/** Best-effort removal of a task's results from YouCam once we've delivered them. */
export async function forgetRemoteTask(taskId: string): Promise<void> {
  if (isMockTaskId(taskId)) return;
  try {
    await deleteTask(taskId);
  } catch {
    // Non-fatal: YouCam also expires task data automatically.
  }
}
