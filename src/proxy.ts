import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { contentSecurityPolicy } from "@/lib/csp";

const PROTECTED = ["/check", "/checks", "/choose", "/profile", "/history", "/settings"];

/**
 * Optimistic redirect only (cookie presence). Every protected page, action and route handler
 * still verifies the session against the database.
 *
 * Also sets each page's Content-Security-Policy with a fresh nonce. Next.js reads it from the request and adds it to
 * its own inline scripts, so no other inline script can run.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (needsAuth && !request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const policy = contentSecurityPolicy(btoa(crypto.randomUUID()));
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
