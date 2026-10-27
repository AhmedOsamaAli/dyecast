import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { generateCodeVerifier, generateState } from "arctic";
import { GOOGLE_STATE_COOKIE, GOOGLE_VERIFIER_COOKIE, googleClient } from "@/lib/auth/google";

const TEN_MINUTES = 60 * 10;

export async function GET(request: Request): Promise<Response> {
  const google = googleClient();
  if (!google) return NextResponse.redirect(new URL("/login?error=google_unavailable", request.url));

  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, verifier, ["openid", "email", "profile"]);
  url.searchParams.set("prompt", "select_account");

  const store = await cookies();
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/auth/google",
    maxAge: TEN_MINUTES,
  };
  store.set(GOOGLE_STATE_COOKIE, state, options);
  store.set(GOOGLE_VERIFIER_COOKIE, verifier, options);
  return NextResponse.redirect(url);
}
