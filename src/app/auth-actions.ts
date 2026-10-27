"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword, sha256, verifyPassword } from "@/lib/auth/crypto";
import { createSession, destroyCurrentSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rate-limit";
import { fieldErrors, loginSchema, signupSchema, type FieldErrors } from "@/lib/auth/validation";

export interface AuthState {
  error?: string;
  fields?: FieldErrors;
}

export async function register(_previous: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Check the highlighted fields.", fields: fieldErrors(parsed.error) };
  const { email, password, displayName } = parsed.data;
  const limit = await rateLimit(`signup:${sha256(email)}`, 3, 60 * 60 * 1000);
  if (!limit.ok) return { error: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.` };
  const now = new Date();
  const [user] = await db.insert(users).values({
    id: crypto.randomUUID(),
    email,
    displayName,
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing({ target: users.email }).returning({ id: users.id });
  if (!user) return { error: "Unable to register this email. If you already have an account, sign in." };
  await createSession(user.id, (await headers()).get("user-agent"));
  redirect("/check");
}

export async function login(_previous: AuthState, form: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Check the highlighted fields.", fields: fieldErrors(parsed.error) };
  const { email, password } = parsed.data;
  const limit = await rateLimit(`login:${sha256(email)}`, 10, 15 * 60 * 1000);
  if (!limit.ok) return { error: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.` };
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Hash anyway when there's no password to compare, so response time doesn't reveal which accounts exist.
  const valid = user?.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : (await hashPassword(password), false);
  if (!user || !valid) return { error: "Email or password is incorrect." };
  await createSession(user.id, (await headers()).get("user-agent"));
  redirect("/check");
}

export async function logout(): Promise<void> {
  await destroyCurrentSession();
  redirect("/");
}
