import "server-only";
import { requestErrorMessage } from "./errors";
import type { TaskResult, TaskStatus, YouCamFeature } from "./types";

const BASE_URL = process.env.YOUCAM_API_BASE ?? "https://yce-api-01.makeupar.com";

export function youcamApiKey(): string | undefined {
  return process.env.YOUCAM_API_KEY || undefined;
}

/** Mock mode returns canned results and spends no units (default when no key is configured). */
export function isMockMode(): boolean {
  return process.env.YOUCAM_MOCK === "1" || !youcamApiKey();
}

export class YouCamError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "YouCamError";
  }
}

interface ApiEnvelope<T> {
  status?: number;
  data?: T;
  error_code?: string;
  error?: string;
  message?: string;
  error_message?: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const key = youcamApiKey();
  if (!key) throw new YouCamError("YouCam API key is not configured.", "no_key");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json: ApiEnvelope<T> = {};
  try {
    json = text ? (JSON.parse(text) as ApiEnvelope<T>) : {};
  } catch {
    // Non-JSON error bodies are reported by status below.
  }
  if (!res.ok) {
    const code = json.error_code ?? json.error ?? `http_${res.status}`;
    // YouCam's own message stays in the server log; people get plain words (see errors.ts).
    console.error("YouCam request failed", res.status, String(code).slice(0, 80));
    throw new YouCamError(requestErrorMessage(res.status), "photo_service", res.status, res.status === 429 || res.status >= 500);
  }
  return json;
}

interface FileEntry {
  file_id?: string;
  requests?: Array<{ url?: string; method?: string; headers?: Record<string, string | number> }>;
}

/** Registers a file with the File API, then PUTs the bytes to the pre-signed URL. Returns the file_id. */
export async function uploadImage(bytes: ArrayBuffer, contentType: string, fileName: string): Promise<string> {
  const json = await request<{ files?: FileEntry[] }>("/s2s/v2.0/file", {
    method: "POST",
    body: JSON.stringify({ files: [{ content_type: contentType, file_name: fileName, file_size: bytes.byteLength }] }),
  });
  const file = (json.data?.files ?? (json as { files?: FileEntry[] }).files)?.[0];
  const target = file?.requests?.[0];
  if (!file?.file_id || !target?.url) throw new YouCamError("YouCam did not return an upload URL.", "bad_upload_response");

  // Content-Length is computed by fetch from the body; pass the remaining signed headers through.
  const headers = Object.fromEntries(
    Object.entries(target.headers ?? {})
      .filter(([k]) => k.toLowerCase() !== "content-length")
      .map(([k, v]) => [k, String(v)]),
  );
  const put = await fetch(target.url, {
    method: target.method ?? "PUT",
    headers: { "Content-Type": contentType, ...headers },
    body: bytes,
    signal: AbortSignal.timeout(30_000),
  });
  if (!put.ok) throw new YouCamError(`Uploading the image failed (${put.status}).`, "upload_failed", put.status, put.status >= 500);
  return file.file_id;
}

export async function createTask(feature: YouCamFeature, body: Record<string, unknown>): Promise<string> {
  const json = await request<{ task_id?: string }>(`/s2s/v2.0/task/${feature}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const taskId = json.data?.task_id;
  if (!taskId) throw new YouCamError("YouCam did not return a task id.", "bad_task_response");
  return taskId;
}

export async function getTask<T>(feature: YouCamFeature, taskId: string): Promise<TaskResult<T>> {
  const json = await request<{ task_status?: TaskStatus; results?: T; error?: string | null; error_message?: string }>(
    `/s2s/v2.0/task/${feature}/${encodeURIComponent(taskId)}`,
  );
  const data = json.data ?? {};
  return {
    status: data.task_status ?? "running",
    results: data.results,
    error: data.error ?? undefined,
    errorMessage: data.error_message,
  };
}

/** Remaining units across subscription and pay-as-you-go balances. */
export async function getRemainingUnits(): Promise<number> {
  const json = (await request<never>("/s2s/v1.0/client/credit")) as { results?: Array<{ amount_dec?: number; amount?: number }> };
  return (json.results ?? []).reduce((sum, r) => sum + (r.amount_dec ?? r.amount ?? 0), 0);
}

/** Deletes a task and its results from YouCam's servers (privacy: we keep nothing we don't need). */
export async function deleteTask(taskId: string): Promise<void> {
  await request<never>("/s2s/v2.0/task/delete", { method: "POST", body: JSON.stringify({ task_id: taskId }) });
}

/** Hosts YouCam serves results from. Render URLs from anywhere else are refused (SSRF guard). */
export function isTrustedResultUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      [".amazonaws.com", ".makeupar.com", ".perfectcorp.com"].some((suffix) => url.hostname.endsWith(suffix))
    );
  } catch {
    return false;
  }
}
