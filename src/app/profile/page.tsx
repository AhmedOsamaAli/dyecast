import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/checks/store";
import { DEFAULT_PROFILE } from "@/lib/checks/validation";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { isMockMode } from "@/lib/youcam/client";
import { ProfileEditor } from "@/components/profile/profile-editor";

export const metadata = { title: "Your hair profile" };

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const user = await requireUser();
  const saved = await getProfile(user.id);
  const { next } = await searchParams;
  const [settings] = await db.select({ storePhotos: users.storePhotos }).from(users).where(eq(users.id, user.id)).limit(1);
  return (
    <main className="page-shell">
      <div className="page-heading">
        <p className="eyebrow">STEP 1 · YOUR HAIR PROFILE</p>
        <h1>Good color starts with your hair.</h1>
        <p className="muted">
          {saved
            ? `Updated ${saved.updatedAt.toISOString().slice(0, 10)}. Change it whenever your hair changes.`
            : `Hi ${user.displayName}. Tell us about your hair once — every check uses it.`}
        </p>
      </div>
      <ProfileEditor
        initial={saved?.profile ?? DEFAULT_PROFILE}
        mockMode={isMockMode()}
        storePhotos={Boolean(settings?.storePhotos)}
        next={next === "choose" ? "choose" : undefined}
      />
    </main>
  );
}
