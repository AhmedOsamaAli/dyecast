import { getCurrentUser } from "@/lib/auth/session";
import { getProfile, listChecks } from "@/lib/checks/store";
import { db } from "@/lib/db/client";
import { apiUsage, oauthAccounts, users } from "@/lib/db/schema";
import { selfieInfo } from "@/lib/photos/store";
import { eq } from "drizzle-orm";

/** Downloads everything stored about the signed-in user as JSON (photos are listed, not embedded). */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const [account] = await db
    .select({ email: users.email, displayName: users.displayName, emailVerified: users.emailVerified, storePhotos: users.storePhotos, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, user.id));
  const linked = await db.select({ provider: oauthAccounts.provider, createdAt: oauthAccounts.createdAt }).from(oauthAccounts).where(eq(oauthAccounts.userId, user.id));
  const usage = await db
    .select({ feature: apiUsage.feature, units: apiUsage.units, status: apiUsage.status, mock: apiUsage.mock, createdAt: apiUsage.createdAt })
    .from(apiUsage)
    .where(eq(apiUsage.userId, user.id));
  const body = {
    exportedAt: new Date().toISOString(),
    account,
    signInMethods: linked,
    hairProfile: (await getProfile(user.id))?.profile ?? null,
    checks: (await listChecks(user.id, 500)).map((c) => ({ id: c.id, createdAt: c.createdAt, input: c.input, report: c.report })),
    storedPhoto: await selfieInfo(user.id),
    photoAnalyses: usage,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="dyecast-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
