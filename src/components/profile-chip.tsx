import Link from "next/link";
import type { HairProfileData } from "@/lib/checks/validation";
import { levelName } from "@/lib/engine/levels";
import { todaySwatch } from "@/lib/engine/swatch";
import { HairSwatch } from "@/components/hair-swatch";

const HISTORY: Record<HairProfileData["history"], string> = {
  virgin: "never colored",
  dyed: "previously dyed",
  highlighted: "highlighted",
  bleached: "bleached",
  henna: "henna or plant dye",
};

/** The person's hair at a glance, linking to the profile to edit it. */
export function ProfileChip({ profile }: { profile: HairProfileData }) {
  return (
    <Link href="/profile" className="profile-chip">
      <HairSwatch className="chip-swatch" {...todaySwatch(profile)} label="Your hair" seed={3} />
      <span>
        <strong>Level {profile.lengthsLevel} · {levelName(profile.lengthsLevel)}</strong>
        <small>{HISTORY[profile.history]} · {profile.gray === "none" ? "no gray" : `${profile.gray} gray`} · edit</small>
      </span>
    </Link>
  );
}
