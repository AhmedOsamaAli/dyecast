import "server-only";
import { and, eq } from "drizzle-orm";
import { Google } from "arctic";
import { db } from "@/lib/db/client";
import { oauthAccounts, sessions, users } from "@/lib/db/schema";
import { parseGoogleClaims, type GoogleClaims } from "./google-claims";

export { parseGoogleClaims, type GoogleClaims };

export const GOOGLE_STATE_COOKIE = "dc_g_state";
export const GOOGLE_VERIFIER_COOKIE = "dc_g_verifier";

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleClient(): Google | null {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return null;
  return new Google(id, secret, `${appUrl()}/api/auth/google/callback`);
}

export function googleClientId(): string {
  return process.env.GOOGLE_CLIENT_ID ?? "";
}

/**
 * Finds the account linked to this Google identity, links an existing account with the same
 * Google-verified email, or creates a new password-less account.
 *
 * Linking to an account whose email was never verified removes its password and signs out its
 * sessions (`secured: true`): whoever registered that email may not own it, so their credentials
 * must not outlive the real owner's first verified sign-in (pre-account hijacking defence).
 */
export async function upsertGoogleUser(claims: GoogleClaims): Promise<{ userId: string; created: boolean; secured: boolean }> {
  return db.transaction(async (tx) => {
    const [linked] = await tx
      .select({ userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerUserId, claims.sub)))
      .limit(1);
    if (linked) return { userId: linked.userId, created: false, secured: false };

    const now = new Date();
    const [existing] = await tx
      .select({ id: users.id, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, claims.email))
      .limit(1);
    const userId = existing?.id ?? crypto.randomUUID();
    let secured = false;
    if (existing && !existing.emailVerified) {
      await tx.update(users).set({ emailVerified: true, passwordHash: null, updatedAt: now }).where(eq(users.id, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      secured = true;
    }
    if (!existing) {
      await tx.insert(users).values({
        id: userId,
        email: claims.email,
        passwordHash: null,
        displayName: claims.name,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    await tx.insert(oauthAccounts).values({ provider: "google", providerUserId: claims.sub, userId, createdAt: now });
    return { userId, created: !existing, secured };
  });
}
