import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getProfile } from "@/lib/checks/store";
import { db } from "@/lib/db/client";
import { apiUsage, oauthAccounts, savedChecks, sessions, users, youcamFiles } from "@/lib/db/schema";
import { selfieInfo } from "@/lib/photos/store";
import { eq } from "drizzle-orm";

/** Downloads everything stored about the signed-in user as JSON (photos are listed, not embedded). */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const limit = await rateLimit(`export:${user.id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return Response.json({ error: "Too many downloads. Try again later." }, { status: 429 });
  const [account] = await db
    .select({ email: users.email, displayName: users.displayName, emailVerified: users.emailVerified, storePhotos: users.storePhotos, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, user.id));
  const linked = await db.select({ provider: oauthAccounts.provider, createdAt: oauthAccounts.createdAt }).from(oauthAccounts).where(eq(oauthAccounts.userId, user.id));
  const usage = await db
    .select({ feature: apiUsage.feature, units: apiUsage.units, status: apiUsage.status, mock: apiUsage.mock, createdAt: apiUsage.createdAt })
    .from(apiUsage)
    .where(eq(apiUsage.userId, user.id));
  const signedIn = await db
    .select({ device: sessions.userAgent, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.userId, user.id));
  const uploads = await db.select({ createdAt: youcamFiles.createdAt }).from(youcamFiles).where(eq(youcamFiles.userId, user.id));
  const checks = await db.select({
    id: savedChecks.id, createdAt: savedChecks.createdAt, input: savedChecks.input, report: savedChecks.report,
  }).from(savedChecks).where(eq(savedChecks.userId, user.id));
  const body = {
    exportedAt: new Date().toISOString(),
    account,
    signInMethods: linked,
    activeSessions: signedIn,
    hairProfile: (await getProfile(user.id))?.profile ?? null,
    checks,
    storedPhoto: await selfieInfo(user.id),
    photoAnalyses: usage,
    photoUploadsToYouCam: uploads,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="dyecast-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
