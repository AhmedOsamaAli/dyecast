import "server-only";
import { getCurrentUser, type SafeUser } from "@/lib/auth/session";
import { YouCamError } from "@/lib/youcam/client";

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...init.headers },
  });
}

export function apiError(message: string, status: number, code = "error"): Response {
  return json({ error: message, code }, { status });
}

/** Rejects cross-site state-changing requests (Server Actions have this built in; route handlers don't). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export type ApiUser = { user: SafeUser; response?: undefined } | { user?: undefined; response: Response };

export async function apiUser(request: Request, { mutation = false } = {}): Promise<ApiUser> {
  if (mutation && !isSameOrigin(request)) return { response: apiError("Cross-site request refused.", 403, "origin") };
  const user = await getCurrentUser();
  if (!user) return { response: apiError("Please sign in again.", 401, "unauthenticated") };
  return { user };
}

export function errorResponse(error: unknown): Response {
  if (error instanceof YouCamError) {
    const status = error.httpStatus && error.httpStatus >= 400 && error.httpStatus < 600 ? error.httpStatus : 502;
    return apiError(error.message, status === 401 || status === 403 ? 502 : status, error.code);
  }
  console.error("Unexpected API error", error instanceof Error ? error.message : "unknown");
  return apiError("Something went wrong. Please try again.", 500);
}
