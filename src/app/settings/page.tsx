import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { oauthAccounts, users } from "@/lib/db/schema";
import { photoStorageAvailable, selfieInfo } from "@/lib/photos/store";
import { unitsUsedToday } from "@/lib/youcam/service";
import { isMockMode } from "@/lib/youcam/client";
import { AccountForm, DangerZone, PasswordForm, PrivacyActions } from "@/components/settings-forms";
import { Notice } from "@/components/notice";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requireUser();
  const { notice } = await searchParams;
  const [account] = await db
    .select({ passwordHash: users.passwordHash, storePhotos: users.storePhotos, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, user.id));
  const linked = await db.select({ provider: oauthAccounts.provider }).from(oauthAccounts).where(eq(oauthAccounts.userId, user.id));
  const stored = await selfieInfo(user.id);
  const used = await unitsUsedToday(user.id);

  return (
    <main className="page-shell settings-page">
      <div className="page-heading">
        <p className="eyebrow">SETTINGS</p>
        <h1>Your account, your data.</h1>
        <p className="muted">{user.email}{linked.length ? " · signed in with Google" : ""}{account?.emailVerified ? " · verified" : ""}</p>
      </div>
      <Notice code={notice} />
      <div className="settings-grid">
        <section className="panel">
          <h2>Profile & photos</h2>
          <AccountForm displayName={user.displayName} storePhotos={Boolean(account?.storePhotos)} storageAvailable={photoStorageAvailable()} />
        </section>
        <section className="panel">
          <h2>Privacy</h2>
          <ul className="privacy-points small">
            <li>Stored photo: {stored ? `encrypted selfie, ${Math.round(stored.bytes / 1024)} KB, auto-deletes ${stored.expiresAt.toISOString().slice(0, 10)}` : "none"}.</li>
            <li>Photo analyses in the last 24 h: {used} units{isMockMode() ? " (demo mode — no real analyses)" : ""}.</li>
            <li>Analysis results are deleted from YouCam as soon as we receive them. <Link href="/privacy">How we handle photos</Link></li>
          </ul>
          <PrivacyActions hasStoredPhoto={Boolean(stored)} />
        </section>
        <section className="panel">
          <h2>{account?.passwordHash ? "Password" : "Password (optional)"}</h2>
          <PasswordForm hasPassword={Boolean(account?.passwordHash)} />
        </section>
        <section className="panel danger-panel">
          <h2>Sign-out & deletion</h2>
          <DangerZone />
        </section>
      </div>
    </main>
  );
}
