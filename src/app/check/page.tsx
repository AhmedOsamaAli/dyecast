import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/checks/store";
import { CHECK_SOURCES, type CheckSource } from "@/lib/checks/validation";
import { CheckWizard } from "@/components/check/check-wizard";
import { ProfileChip } from "@/components/profile-chip";
import { GOAL_COLORS } from "@/data/goals";

export const metadata = { title: "Check a shade" };

export default async function CheckPage({ searchParams }: PageProps<"/check">) {
  const user = await requireUser();
  const saved = await getProfile(user.id);
  if (!saved) redirect("/profile");
  const params = await searchParams;
  const mode = typeof params.mode === "string" && (CHECK_SOURCES as readonly string[]).includes(params.mode) ? (params.mode as CheckSource) : "goal";
  const goal = typeof params.goal === "string" ? GOAL_COLORS.find((g) => g.id === params.goal) : undefined;
  const p = saved.profile;
  return (
    <main className="page-shell">
      {params.profile === "saved" && <p role="status" className="notice success">Hair profile saved. Now choose a color.</p>}
      <div className="page-heading with-profile">
        <div>
          <p className="eyebrow">YOUR COLOR STUDIO</p>
          <h1>What could this color really look like on you?</h1>
          <p className="muted small">
            Not sure what you want yet? <Link href="/choose" className="inline-link"><Sparkles size={14} aria-hidden="true" /> Help me choose</Link>
          </p>
        </div>
        <ProfileChip profile={p} />
      </div>
      <CheckWizard profile={{ ...p, levelConfirmed: true }} initialMode={mode} initialGoal={goal ? { hex: goal.hex, name: goal.name } : undefined} />
    </main>
  );
}
