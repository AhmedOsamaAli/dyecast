import "server-only";
import { and, asc, eq, gte, inArray, isNull, like, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { apiUsage, youcamFiles } from "@/lib/db/schema";
import { sniffImage } from "@/lib/photos/validate";
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
/** Cap across all users, so a public demo can't drain the account's free units in one day. */
const DAILY_UNITS_TOTAL = Number(process.env.YOUCAM_DAILY_UNITS_TOTAL ?? 300);
const MIN_REMAINING_UNITS = Number(process.env.YOUCAM_MIN_REMAINING_UNITS ?? 60);
const BALANCE_CACHE_MS = 60_000;
const MAX_RENDER_BYTES = 10 * 1024 * 1024;

let balanceCache: { value: number; at: number } | null = null;

async function balanceSnapshot(): Promise<{ value: number; at: number }> {
  if (balanceCache && Date.now() - balanceCache.at < BALANCE_CACHE_MS) return balanceCache;
  const at = Date.now();
  const value = await getRemainingUnits();
  balanceCache = { value, at };
  return balanceCache;
}

/** Units this user spent (or has in flight) in the last 24 hours. */
export async function unitsUsedToday(userId: string): Promise<number> {
  return unitsSpentSince(eq(apiUsage.userId, userId));
}

/** Units spent (or in flight) in the last 24 hours, optionally for one user only. */
async function unitsSpentSince(scope?: SQL): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${apiUsage.units}), 0)` })
    .from(apiUsage)
    .where(
      and(
        scope,
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

/** Placeholder task id of a hold whose task hasn't started yet. */
const PENDING = "pending_";

/** Units held for one task. Becomes a task with {@link startReserved}, or is refunded with {@link releaseReservation}. */
export interface Reservation {
  id: string;
  feature: YouCamFeature;
  mock: boolean;
}

/** The read-only part of the budget check, for refusing early (before an upload) with the right message. */
async function assertAffordable(userId: string, units: number): Promise<void> {
  if ((await unitsUsedToday(userId)) + units > DAILY_UNITS_PER_USER) throw budgetError("user");
  if ((await unitsSpentSince()) + units > DAILY_UNITS_TOTAL) throw budgetError("global");
  const balance = await balanceSnapshot();
  const [reserved] = await db.select({ total: sql<number>`coalesce(sum(${apiUsage.units}), 0)` }).from(apiUsage).where(
    and(eq(apiUsage.mock, false), sql`${apiUsage.status} != 'error'`, or(
      eq(apiUsage.status, "created"), gte(apiUsage.createdAt, new Date(balance.at)),
    )),
  );
  if (balance.value - Number(reserved.total) - units < MIN_REMAINING_UNITS) throw budgetError("floor");
}

function budgetError(kind: "user" | "global" | "floor"): YouCamError {
  if (kind === "user") {
    return new YouCamError("You've reached today's photo analysis limit. Try again tomorrow — color forecasts still work.", "daily_budget", 429);
  }
  if (kind === "global") {
    return new YouCamError("Live photo analysis is busy today. Try again tomorrow — color forecasts still work.", "global_daily_budget", 503);
  }
  return new YouCamError("Live photo analysis is paused to protect the demo budget. Color forecasts still work.", "global_floor", 503);
}

/** Throws the budget error a request for these tasks would get, without holding anything. */
export async function checkBudget(userId: string, features: YouCamFeature[]): Promise<void> {
  if (isMockMode()) return;
  await assertAffordable(userId, features.reduce((sum, f) => sum + FEATURE_UNITS[f], 0));
}

/**
 * Holds units for a set of tasks in one atomic statement (all or none), so parallel requests can't overshoot the
 * per-user or shared daily caps. Call it before uploading anything: a refused request never sends a photo out.
 */
export async function reserveUnits(userId: string, features: YouCamFeature[], mock = isMockMode()): Promise<Reservation[]> {
  if (!features.length) throw new Error("Cannot reserve an empty set of YouCam tasks.");
  const now = new Date();
  const holds = features.map((feature) => ({
    id: crypto.randomUUID(),
    feature,
    units: mock ? 0 : FEATURE_UNITS[feature],
    taskId: `${PENDING}${crypto.randomUUID()}`,
  }));
  if (mock) {
    await db.insert(apiUsage).values(holds.map((h) => ({ ...h, userId, status: "created" as const, mock: true, createdAt: now })));
    return holds.map(({ id, feature }) => ({ id, feature, mock: true }));
  }
  const total = holds.reduce((sum, h) => sum + h.units, 0);
  const balance = await balanceSnapshot();
  if (balance.value - total < MIN_REMAINING_UNITS) throw budgetError("floor");

  const spent = (scope?: SQL) => sql`(select coalesce(sum(${apiUsage.units}), 0) from ${apiUsage} where ${and(
    scope,
    eq(apiUsage.mock, false),
    gte(apiUsage.createdAt, new Date(now.getTime() - DAY_MS)),
    sql`${apiUsage.status} != 'error'`,
  )})`;
  // Count both in-flight tasks and reservations made since this balance was read. A cached balance alone would let
  // parallel requests spend the same remaining units more than once.
  const unreflected = sql`(select coalesce(sum(${apiUsage.units}), 0) from ${apiUsage} where ${and(
    eq(apiUsage.mock, false),
    sql`${apiUsage.status} != 'error'`,
    or(eq(apiUsage.status, "created"), gte(apiUsage.createdAt, new Date(balance.at))),
  )})`;
  const rows = sql.join(holds.map((h) => sql`(${h.id}, ${h.feature}, ${h.units}, ${h.taskId})`), sql`, `);
  const result = await db.run(sql`
    with affordable(ok) as materialized (
      select ${spent(eq(apiUsage.userId, userId))} + ${total} <= ${DAILY_UNITS_PER_USER}
        and ${spent()} + ${total} <= ${DAILY_UNITS_TOTAL}
        and ${unreflected} + ${total} <= ${balance.value - MIN_REMAINING_UNITS}
    )
    insert into ${apiUsage} (id, user_id, feature, units, task_id, status, mock, created_at)
    select column1, ${userId}, column2, column3, column4, 'created', 0, ${now.getTime()}
    from (values ${rows}) cross join affordable where affordable.ok`);
  if (result.rowsAffected !== holds.length) {
    if (result.rowsAffected) await db.delete(apiUsage).where(inArray(apiUsage.id, holds.map((h) => h.id)));
    await assertAffordable(userId, total);
    // The caps were full a moment ago, but another request's hold was refunded since.
    throw budgetError("global");
  }
  return holds.map(({ id, feature }) => ({ id, feature, mock: false }));
}

/** Refunds a hold whose task never started. */
export async function releaseReservation(hold: Reservation): Promise<void> {
  await db.delete(apiUsage).where(and(eq(apiUsage.id, hold.id), like(apiUsage.taskId, `${PENDING}%`)));
}

/** Starts the task a hold was made for. If YouCam refuses it, the hold is refunded. */
export async function startReserved(hold: Reservation, body: Record<string, unknown>): Promise<{ taskId: string; mock: boolean }> {
  const mock = hold.mock || isMockFileId(String(body.src_file_id ?? ""));
  let taskId: string;
  try {
    taskId = mock ? mockTaskId(hold.feature) : await createTask(hold.feature, body);
  } catch (error) {
    await releaseReservation(hold).catch(() => console.error("Could not refund a YouCam reservation; cleanup will retry."));
    throw error;
  }
  try {
    const updated = await db.update(apiUsage)
      .set(mock ? { taskId, mock: true, units: 0 } : { taskId })
      .where(and(eq(apiUsage.id, hold.id), like(apiUsage.taskId, `${PENDING}%`)))
      .returning({ id: apiUsage.id });
    if (!updated.length) throw new Error("The photo task reservation is no longer available.");
  } catch (error) {
    await forgetRemoteTask(taskId);
    throw error;
  }
  return { taskId, mock };
}

/** Starts one task after holding its units (see {@link reserveUnits}). */
export async function startTask(
  userId: string,
  feature: YouCamFeature,
  body: Record<string, unknown>,
): Promise<{ taskId: string; mock: boolean }> {
  const mock = isMockMode() || isMockFileId(String(body.src_file_id ?? ""));
  const [hold] = await reserveUnits(userId, [feature], mock);
  return startReserved(hold, body);
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
  if (!res.ok) throw new YouCamError("The render could not be downloaded.", "render_download", 502, true);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_RENDER_BYTES) throw new YouCamError("The render is too large.", "render_size", 502);
  // YouCam's storage labels renders "binary/octet-stream", so the format is read from the bytes themselves.
  const image = sniffImage(new Uint8Array(bytes));
  if (!image) throw new YouCamError("The render could not be read.", "render_download", 502, true);
  await db.update(apiUsage).set({ resultUrl: null }).where(eq(apiUsage.id, usage.id));
  return { bytes, contentType: image.mime };
}

/** Runs `fn` over `items`, at most `limit` at a time. Errors propagate rather than masquerading as cleanup success. */
async function eachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  }));
}

/**
 * Account deletion: attempts a bounded batch now. Every unconfirmed task stays in the cleanup queue even after its
 * usage row is detached from this account, so a provider outage cannot prevent account deletion or lose retries.
 */
export async function forgetUserTasks(userId: string): Promise<void> {
  const rows = await db
    .select({ taskId: apiUsage.taskId })
    .from(apiUsage)
    .where(and(eq(apiUsage.userId, userId), eq(apiUsage.mock, false), isNull(apiUsage.deletedAt)))
    .limit(10);
  await db.delete(apiUsage).where(and(eq(apiUsage.userId, userId), like(apiUsage.taskId, `${PENDING}%`)));
  await db.update(apiUsage).set({ resultUrl: null }).where(eq(apiUsage.userId, userId));
  await eachLimited(rows.map((r) => r.taskId).filter((id) => !id.startsWith(PENDING)), 6, forgetRemoteTask);
}

async function deleteRemoteTask(taskId: string): Promise<boolean> {
  if (isMockTaskId(taskId) || taskId.startsWith(PENDING)) return true;
  try {
    await deleteTask(taskId);
  } catch (error) {
    if (!(error instanceof YouCamError && (error.code === "task_not_found" || error.httpStatus === 404 || error.httpStatus === 410))) {
      console.error("YouCam task deletion was not confirmed; left queued for retry.",
        error instanceof YouCamError ? error.httpStatus : "network");
      return false;
    }
  }
  await db.update(apiUsage).set({ deletedAt: new Date(), resultUrl: null }).where(eq(apiUsage.taskId, taskId));
  return true;
}

/** Attempts deletion now; only a confirmed deletion leaves the durable retry queue. */
export async function forgetRemoteTask(taskId: string): Promise<void> {
  await deleteRemoteTask(taskId);
}

/** Tasks the normal flow didn't clean up are swept once they're this old (YouCam tasks finish in seconds). */
export const SWEEP_AFTER_MS = 15 * 60 * 1000;

/**
 * Deletes the YouCam copies the normal flow left behind: tasks nobody waited for (a closed tab or a timeout), renders
 * nobody downloaded, and holds whose task never started. Runs daily (see /api/cron/cleanup).
 */
export async function sweepStaleTasks(now = Date.now(), limit = 100): Promise<{ deleted: number; released: number; pending: number }> {
  const deadline = Date.now() + 180_000;
  const rows = await db
    .select({ id: apiUsage.id, taskId: apiUsage.taskId, feature: apiUsage.feature, status: apiUsage.status })
    .from(apiUsage)
    .where(
      and(
        eq(apiUsage.mock, false),
        lt(apiUsage.createdAt, new Date(now - SWEEP_AFTER_MS)),
        isNull(apiUsage.deletedAt),
      ),
    )
    .orderBy(asc(apiUsage.createdAt))
    .limit(limit);
  const tally = { deleted: 0, released: 0, pending: 0 };
  await eachLimited(rows, 5, async (row) => {
    if (Date.now() >= deadline) {
      tally.pending++;
      return;
    }
    if (row.taskId.startsWith(PENDING)) {
      await db.delete(apiUsage).where(eq(apiUsage.id, row.id));
      tally.released++;
      return;
    }
    let status = row.status;
    let gone = false;
    if (status === "created") {
      try {
        const task = await getTask(row.feature as YouCamFeature, row.taskId);
        if (task.status !== "running") status = task.status;
      } catch (error) {
        gone = error instanceof YouCamError && (error.code === "task_not_found" || error.httpStatus === 404 || error.httpStatus === 410);
        if (!gone) console.error("YouCam cleanup could not read a task; left queued for retry.",
          error instanceof YouCamError ? error.httpStatus : "network");
      }
    }
    if (status === "created" && !gone) {
      tally.pending++;
      return;
    }
    if (!gone && !(await deleteRemoteTask(row.taskId))) {
      tally.pending++;
      return;
    }
    await db
      .update(apiUsage)
      // A task YouCam no longer knows keeps its units: whether it was charged is unknown.
      .set({
        status: status === "created" ? "success" : status,
        ...(status === "error" ? { units: 0 } : {}),
        resultUrl: null,
        deletedAt: new Date(),
      })
      .where(eq(apiUsage.id, row.id));
    tally.deleted++;
  });
  return tally;
}
