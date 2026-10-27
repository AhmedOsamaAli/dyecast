import { deltaE2000, labToHex, mixLab, type Lab } from "@/lib/color";
import { SHADE_CATALOG, type CatalogShade } from "@/data/shades";
import { levelFromLightness } from "./levels";
import { applyToner, GAP_DIFFERENT, predict } from "./predict";
import { PRODUCTS } from "./products";
import type { FlagId, HairProfileInput, Prediction } from "./types";

export interface PathStep {
  shade: CatalogShade;
  role: "color" | "toner";
}

export interface PathOption {
  id: string;
  steps: PathStep[];
  resultHex: string;
  resultLab: Lab;
  /** CIEDE2000 distance between the predicted result and the goal. */
  distance: number;
  score: number;
  flags: FlagId[];
  prediction: Prediction;
}

export interface PathResult {
  goalHex: string;
  goalLevel: number;
  options: PathOption[];
  professional: boolean;
  professionalReason?: string;
}

const RISK_PENALTY: Partial<Record<FlagId, number>> = {
  "hot-roots": 2,
  muddy: 4,
  "gray-blend": 1.5,
  patchy: 3,
  "needs-bleach": 6,
  "henna-risk": 6,
  stalled: 1,
};

const TONER_PENALTY = 2.5;

function overall(p: Prediction): Lab {
  return mixLab(p.lengths.lab, p.roots.lab, 0.25);
}

/**
 * Searches the catalog for the shades (and shade + toner combinations) whose predicted result on this
 * person's hair lands closest to the goal color. Two-step routines and risky outcomes are penalized.
 */
export function findPaths(
  profile: HairProfileInput,
  goal: Lab,
  opts: { limit?: number; catalog?: CatalogShade[] } = {},
): PathResult {
  const catalog = opts.catalog ?? SHADE_CATALOG;
  const limit = opts.limit ?? 3;
  const goalLevel = levelFromLightness(goal.L);
  const toners = catalog.filter((s) => s.role === "toner");
  const candidates: PathOption[] = [];

  for (const shade of catalog.filter((s) => s.role === "color")) {
    const p = predict(profile, shade, shade.product);
    const penalty = p.flags.reduce((sum, f) => sum + (RISK_PENALTY[f] ?? 0), 0);
    const lab = overall(p);
    const distance = deltaE2000(goal, lab);
    candidates.push({
      id: shade.id,
      steps: [{ shade, role: "color" }],
      resultLab: lab,
      resultHex: labToHex(lab),
      distance,
      score: distance + penalty,
      flags: p.flags,
      prediction: p,
    });

    if (p.lengths.lift < 1 && p.roots.lift < 1) continue;
    for (const toner of toners) {
      if (Math.abs(toner.level - p.lengths.level) > 1.5) continue;
      const toned = mixLab(
        applyToner(p.lengths.lab, p.lengths.level, toner),
        applyToner(p.roots.lab, p.roots.level, toner),
        0.25,
      );
      const d = deltaE2000(goal, toned);
      candidates.push({
        id: `${shade.id}+${toner.id}`,
        steps: [
          { shade, role: "color" },
          { shade: toner, role: "toner" },
        ],
        resultLab: toned,
        resultHex: labToHex(toned),
        distance: d,
        score: d + penalty + TONER_PENALTY,
        flags: p.flags.filter((f) => f !== "brassy"),
        prediction: p,
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  const seen = new Set<string>();
  const options: PathOption[] = [];
  for (const c of candidates) {
    const key = c.steps[0].shade.id;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(c);
    if (options.length >= limit) break;
  }

  const naturalStart = profile.history === "virgin" ? profile.lengthsLevel : profile.naturalLevel;
  const maxLift = PRODUCTS["high-lift"].lift(naturalStart) + (profile.thickness === "fine" ? 0.5 : 0);
  let professionalReason: string | undefined;
  if (!options.length || options[0].distance > GAP_DIFFERENT) {
    professionalReason =
      "No box shade gets close to this color on your hair. Lightener (bleach) plus a toner — ideally from a colorist — is the realistic route.";
  } else if (goalLevel - naturalStart > maxLift + 0.5) {
    professionalReason = `That's about ${Math.round(goalLevel - naturalStart)} levels lighter than your natural color — beyond what box dye can lift.`;
  } else if (profile.history !== "virgin" && profile.history !== "bleached" && goalLevel > profile.lengthsLevel + 1) {
    professionalReason =
      "Your lengths are already colored, and dye can't lighten old dye. The lengths need a color remover or salon lightening.";
  }

  return { goalHex: labToHex(goal), goalLevel, options, professional: Boolean(professionalReason), professionalReason };
}
