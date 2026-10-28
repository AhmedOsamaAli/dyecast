"use client";

export type AnalysisFeature = "skin-tone-analysis" | "hair-length-detection" | "hair-density-detection";

export interface AnalyzeResponse {
  mock: boolean;
  tasks: { tone: string; length: string; density?: string };
  storedUntil?: string;
}

export interface ToneResults {
  hairColor?: string;
  hairColorName?: string;
  skinColor?: string;
  lighting?: string;
  frontal?: string;
}

export interface TermResults {
  term?: string;
}

export interface TaskPoll<T> {
  status: "running" | "success" | "error";
  mock: boolean;
  results?: T;
  error?: string;
}

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
  }
}

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) throw new ApiError(body.error ?? "Something went wrong.", body.code ?? "error", res.status);
  return body;
}

export async function analyzePhoto(photo: Blob, densityPhoto?: Blob): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.set("consent", "yes");
  form.set("photo", photo, "selfie.jpg");
  if (densityPhoto) form.set("densityPhoto", densityPhoto, "density.jpg");
  return readJson(await fetch("/api/youcam/analyze", { method: "POST", body: form }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls a YouCam task until it finishes (YouCam tasks usually take a few seconds). */
export async function waitForTask<T>(
  feature: AnalysisFeature | "hair-color",
  taskId: string,
  { timeoutMs = 60_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<TaskPoll<T>> {
  const started = Date.now();
  let delay = 900;
  for (;;) {
    if (signal?.aborted) throw new ApiError("Cancelled.", "aborted", 0);
    const poll = await readJson<TaskPoll<T>>(
      await fetch(`/api/youcam/tasks/${feature}/${encodeURIComponent(taskId)}`, { signal, cache: "no-store" }),
    );
    if (poll.status !== "running") return poll;
    if (Date.now() - started > timeoutMs) throw new ApiError("The analysis is taking too long. Try again.", "timeout", 0);
    await sleep(delay);
    delay = Math.min(3000, delay * 1.4);
  }
}

export type RenderRequest =
  | { fileId: string; mode: "full"; color: string; intensity: number; shine: number }
  | { fileId: string; mode: "ombre"; top: string; bottom: string; intensity: number; shine: number; blend: number; offset: number };

export async function startRender(req: RenderRequest): Promise<{ taskId: string; mock: boolean }> {
  return readJson(
    await fetch("/api/youcam/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) }),
  );
}

/** Downloads a finished render (delivered once). Null means "mock mode — render locally". */
export async function fetchRender(taskId: string): Promise<Blob | null> {
  const res = await fetch(`/api/youcam/renders/${encodeURIComponent(taskId)}`, { cache: "no-store" });
  if (res.status === 204) return null;
  if (!res.ok) await readJson(res);
  return res.blob();
}

export async function deleteStoredPhotos(): Promise<void> {
  await readJson(await fetch("/api/photos/selfie", { method: "DELETE" }));
}

/**
 * Uploads a photo for one try-on render (no analysis units). Every YouCam task needs its own
 * upload: deleting a finished task also deletes its input file.
 */
export async function uploadPhoto(photo: Blob): Promise<{ fileId: string; mock: boolean }> {
  const form = new FormData();
  form.set("consent", "yes");
  form.set("photo", photo, "selfie.jpg");
  return readJson(await fetch("/api/youcam/upload", { method: "POST", body: form }));
}

export async function fetchStoredSelfie(): Promise<Blob | null> {
  const res = await fetch("/api/photos/selfie", { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) await readJson(res);
  return res.blob();
}
