import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/checks/store";
import { reachGoals, undertoneFromSkin } from "@/lib/engine/recommend";
import { ChooseWizard } from "@/components/choose/choose-wizard";
import { ProfileChip } from "@/components/profile-chip";

export const metadata = { title: "Help me choose" };

export default async function ChoosePage({ searchParams }: PageProps<"/choose">) {
  const user = await requireUser();
  const saved = await getProfile(user.id);
  if (!saved) redirect("/profile?next=choose");
  const params = await searchParams;
  const p = saved.profile;
  // The route search runs once here; the answers only re-rank the results in the browser.
  const reach = reachGoals({ ...p, levelConfirmed: true });
  const skinHex = p.measurement?.skinHex;
  return (
    <main className="page-shell">
      {params.profile === "saved" && <p role="status" className="notice success">Hair profile saved. Now let&apos;s find your color.</p>}
      <div className="page-heading with-profile">
        <div>
          <p className="eyebrow">HELP ME CHOOSE</p>
          <h1>Find the color that fits you.</h1>
          <p className="muted">Three quick questions. Your best fits update as you answer, worked out on your own hair.</p>
        </div>
        <ProfileChip profile={p} />
      </div>
      <ChooseWizard reach={reach} gray={p.gray} skin={skinHex ? { hex: skinHex, undertone: undertoneFromSkin(skinHex) } : undefined} />
    </main>
  );
}
