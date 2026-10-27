import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users, type User } from "@/lib/db/schema";
import { generateToken, sha256 } from "./crypto";
import { SESSION_COOKIE } from "./session-cookie";

export { SESSION_COOKIE };
const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY;
const RENEW_WITHIN_MS = 15 * DAY;

export type SafeUser = Pick<User, "id" | "email" | "displayName" | "createdAt">;

function toSafeUser(user: User): SafeUser {
  return { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt };
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Creates a session and sets the cookie. Call only from Server Actions or Route Handlers. */
export async function createSession(userId: string, userAgent?: string | null): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt,
    userAgent: userAgent?.slice(0, 200) ?? null,
    createdAt: new Date(),
  });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
}

/** Validates a token, deletes expired sessions and slides the expiry forward when it gets close. */
export async function validateSessionToken(token: string): Promise<{ sessionId: string; user: SafeUser } | null> {
  const id = sha256(token);
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .limit(1);
  if (!row) return null;
  const now = Date.now();
  if (row.session.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (row.session.expiresAt.getTime() - now < RENEW_WITHIN_MS) {
    await db.update(sessions).set({ expiresAt: new Date(now + SESSION_TTL_MS) }).where(eq(sessions.id, id));
  }
  return { sessionId: id, user: toSafeUser(row.user) };
}

/** Current user for this request (memoized per render). */
export const getCurrentUser = cache(async (): Promise<SafeUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await validateSessionToken(token);
  return result?.user ?? null;
});

/** Data Access Layer guard: use in every protected page, action and route handler. */
export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  store.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
