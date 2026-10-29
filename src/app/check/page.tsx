import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/checks/store";
import { CHECK_SOURCES, type CheckSource } from "@/lib/checks/validation";
import { levelName } from "@/lib/engine/levels";
import { todaySwatch } from "@/lib/engine/swatch";
import { CheckWizard } from "@/components/check/check-wizard";
import { HairSwatch } from "@/components/hair-swatch";
import { GOAL_COLORS } from "@/data/goals";

export const metadata = { title: "Check a shade" };

const HISTORY: Record<string, string> = {
  virgin: "never colored",
  dyed: "previously dyed",
  highlighted: "highlighted",
  bleached: "bleached",
  henna: "henna or plant dye",
};

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
        </div>
        <Link href="/profile" className="profile-chip">
          <HairSwatch className="chip-swatch" {...todaySwatch(p)} label="Your hair" seed={3} />
          <span>
            <strong>Level {p.lengthsLevel} · {levelName(p.lengthsLevel)}</strong>
            <small>{HISTORY[p.history]} · {p.gray === "none" ? "no gray" : `${p.gray} gray`} · edit</small>
          </span>
        </Link>
      </div>
      <CheckWizard profile={{ ...p, levelConfirmed: true }} initialMode={mode} initialGoal={goal ? { hex: goal.hex, name: goal.name } : undefined} />
    </main>
  );
}
