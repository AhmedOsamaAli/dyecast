import { timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { decodeIdToken } from "arctic";
import {
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  googleClient,
  googleClientId,
  parseGoogleClaims,
  upsertGoogleUser,
} from "@/lib/auth/google";
import { rateLimit } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth/session";
import { sha256 } from "@/lib/auth/crypto";

function fail(request: Request, reason: string): Response {
  return NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));
}

function sameValue(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(request: Request): Promise<Response> {
  const google = googleClient();
  if (!google) return fail(request, "google_unavailable");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expectedState = store.get(GOOGLE_STATE_COOKIE)?.value;
  const verifier = store.get(GOOGLE_VERIFIER_COOKIE)?.value;
  store.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
  store.delete({ name: GOOGLE_VERIFIER_COOKIE, path: "/api/auth/google" });

  if (url.searchParams.get("error")) return fail(request, "google_cancelled");
  if (!code || !state || !expectedState || !verifier || !sameValue(state, expectedState)) {
    return fail(request, "google_state");
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = await rateLimit(`google:${sha256(ip)}`, 20, 15 * 60 * 1000);
  if (!limit.ok) return fail(request, "rate_limited");

  let claims;
  try {
    const tokens = await google.validateAuthorizationCode(code, verifier);
    claims = parseGoogleClaims(decodeIdToken(tokens.idToken()), googleClientId());
  } catch {
    return fail(request, "google_failed");
  }
  if (!claims) return fail(request, "google_unverified");

  const { userId, secured } = await upsertGoogleUser(claims);
  await createSession(userId, (await headers()).get("user-agent"));
  return NextResponse.redirect(new URL(secured ? "/settings?notice=google_secured" : "/check", request.url));
}
