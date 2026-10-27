import { roundLevel } from "./levels";
import { PRODUCTS } from "./products";
import type { DecodedShade, HairProfileInput, Prediction } from "./types";

export type PlanPhase = "decide" | "before" | "apply" | "after";
export type PlanKind = "stop" | "action" | "tip";

export interface PlanStep {
  id: string;
  phase: PlanPhase;
  kind: PlanKind;
  title: string;
  detail: string;
  /** Short timing hint, e.g. "48 hours before". */
  when?: string;
}

export interface Plan {
  /** True when the plan recommends a professional instead of a box. */
  professional: boolean;
  steps: PlanStep[];
}

export interface PlanOptions {
  boxes: number;
  /** Second step suggested by "get there" (a demi-permanent toner). */
  toner?: DecodedShade;
}

export const PHASE_LABELS: Record<PlanPhase, string> = {
  decide: "Decide",
  before: "Before you dye",
  apply: "On the day",
  after: "After you dye",
};

/**
 * Personalized, ordered plan for one box on one head of hair. Always defers to the product's own
 * instructions; colorist techniques are labeled as tips.
 */
export function buildPlan(profile: HairProfileInput, p: Prediction, options: PlanOptions): Plan {
  const steps: PlanStep[] = [];
  const flags = new Set(p.flags);
  const product = PRODUCTS[p.product];
  const lifting = p.roots.lift > 0 || p.lengths.lift > 0;
  const lighterThanLengths = p.shade.level > profile.lengthsLevel + 0.25;
  const retouch = profile.history === "dyed" && !lighterThanLengths;
  const add = (step: PlanStep) => steps.push(step);

  // ---- Decide: stop signs first ----
  if (flags.has("henna-risk")) {
    add({
      id: "stop-henna",
      phase: "decide",
      kind: "stop",
      title: "Talk to a colorist before using box dye over henna",
      detail: "Henna and some 'natural' plant dyes can block or distort box color, and compound henna may contain metallic salts that react with developer. Don't rely on a home test to prove it's safe.",
    });
  }
  if (flags.has("needs-bleach")) {
    add({
      id: "stop-lift",
      phase: "decide",
      kind: "stop",
      title: "This box can't get you there",
      detail: retouch || profile.history === "dyed"
        ? "Dye can't lighten previously dyed hair. Reaching this shade needs a color remover or lightener — best done by a colorist."
        : `Your hair would need more lift than a box can give (it stops around level ${roundLevel(p.lengths.level)}). Lightening that far is safest with a professional.`,
    });
  }
  if (profile.history === "dyed" && lighterThanLengths) {
    add({
      id: "tip-remover",
      phase: "decide",
      kind: "tip",
      title: "Thinking of a color remover first?",
      detail: "Removers shrink old artificial dye so it can rinse out; they don't lighten natural pigment and don't work on bright fashion colors. Hair grabs color fast afterwards, so their instructions suggest a shade 1–2 levels lighter than your goal. Follow the long rinse and strand test first.",
    });
  }
  if (flags.has("muddy")) {
    add({
      id: "stop-filler",
      phase: "decide",
      kind: "stop",
      title: "Going much darker on light hair needs a 'filler' step",
      detail: "Lightened hair is missing the warm pigments that make brown look rich. Colorists pre-pigment (fill) first, otherwise the result can look flat, murky or green and fade quickly.",
    });
  }
  if (flags.has("patchy")) {
    add({
      id: "warn-highlights",
      phase: "decide",
      kind: "stop",
      title: "Expect stripes over highlights",
      detail: "Highlighted strands take color differently from the rest. A colorist can balance them; a single box usually can't.",
    });
  }
  if (profile.ends === "damaged") {
    add({
      id: "warn-damage",
      phase: "decide",
      kind: "stop",
      title: "Treat or trim very damaged ends first",
      detail: "Damaged hair absorbs dye unevenly and can break after chemical processing. Ask a professional if your hair stretches and snaps when wet.",
    });
  }
  if (flags.has("gray-blend")) {
    add({
      id: "tip-gray",
      phase: "decide",
      kind: "tip",
      title: "For full gray coverage, choose a darker or 'natural' shade",
      detail: `${product.label} color at level ${p.shade.level} blends gray rather than covering it. Natural (N / x.0) shades at level 7 or darker cover best.`,
    });
  }

  // ---- Before ----
  add({
    id: "safety-check",
    phase: "before",
    kind: "action",
    when: "From 3 days before",
    title: "Check you can dye safely",
    detail: "Don't dye if your scalp is irritated, sunburned or broken, if you've ever reacted to hair dye or a temporary 'black henna' tattoo, or within 14 days of bleaching, relaxing or perming. Don't scratch or brush your scalp for 3 days before. EU labels also say these dyes aren't intended for people under 16.",
  });
  add({
    id: "allergy-test",
    phase: "before",
    kind: "action",
    when: "48 hours before",
    title: "Do the allergy alert test from your box — every time",
    detail: "Follow the leaflet exactly, even if you've used the same dye before: sensitivity can build up over time. If you get itching, redness, burning or swelling, don't dye.",
  });
  const strandReasons: string[] = [];
  if (lifting) strandReasons.push("you're lightening");
  if (profile.history !== "virgin") strandReasons.push("your hair has color history");
  if (profile.gray === "half" || profile.gray === "most") strandReasons.push("gray can be resistant");
  if (profile.ends !== "healthy") strandReasons.push("dry ends grab color");
  add({
    id: "strand-test",
    phase: "before",
    kind: "action",
    when: "48 hours before",
    title: "Strand test a hidden section",
    detail: `Color a small section underneath for the full time and check it dry in daylight — the NHS advises doing this at least 48 hours before you dye.${strandReasons.length ? ` It matters even more for you because ${strandReasons.join(", ")}.` : ""} It's the most reliable preview you can get.`,
  });
  add({
    id: "buy",
    phase: "before",
    kind: "action",
    title: options.boxes > 1 ? `Buy ${options.boxes} boxes of the same shade` : "One box should be enough",
    detail: options.boxes > 1
      ? "Mix only one box at a time, but have them all ready — running out halfway leaves patchy color."
      : "If your hair is thicker than you think, keep a second box handy.",
  });
  add({
    id: "prep",
    phase: "before",
    kind: "action",
    title: "Prepare your space",
    detail: "Gloves (in the box), an old towel and top, 4 clips, a timer, and petroleum jelly or a rich cream along your hairline and ears to prevent staining. Ventilate the room.",
  });

  // ---- Apply ----
  add({
    id: "instructions",
    phase: "apply",
    kind: "action",
    title: "Follow every direction on your box",
    detail: "Most box dyes go on dry, unwashed hair — check yours. Wear the gloves, keep dye away from your eyes, never mix different dye products, and mix only when you're ready to apply.",
  });
  add({
    id: "sections",
    phase: "apply",
    kind: "tip",
    title: "Work in 4 sections and thin slices",
    detail: "Part your hair into quarters and apply in thin (about 1 cm) slices so every strand is saturated — uneven coverage is the most common cause of patchy color.",
  });
  if (profile.gray === "half" || profile.gray === "most") {
    add({
      id: "gray-first",
      phase: "apply",
      kind: "tip",
      title: "Start where your gray is most concentrated",
      detail: "Often the front hairline, part and temples. Gray hair tends to need the most processing time.",
    });
  }
  if (retouch) {
    add({
      id: "retouch",
      phase: "apply",
      kind: "action",
      title: "Color your regrowth only",
      detail: "Apply to the new growth and avoid overlapping onto already-colored hair — repeated overlapping builds dark, damaged bands. Refresh faded lengths only as your box describes, usually for the last few minutes.",
    });
  } else if (lifting && profile.history === "virgin") {
    add({
      id: "hot-roots",
      phase: "apply",
      kind: "tip",
      title: "Lightening never-colored hair? Watch for hot roots",
      detail: "Scalp warmth makes roots lighten faster. Colorists often apply to mid-lengths and ends first and add the roots later. Do this only if it fits within your box's total time — otherwise follow the leaflet's order.",
    });
  } else if (profile.history === "dyed" && lighterThanLengths) {
    add({
      id: "roots-only-lift",
      phase: "apply",
      kind: "tip",
      title: "Only your roots will lighten",
      detail: "Previously dyed lengths won't get lighter with new dye, so expect a mismatch between roots and lengths.",
    });
  }
  add({
    id: "timer",
    phase: "apply",
    kind: "action",
    title: "Time it exactly as the leaflet says",
    detail: "Use a timer. Leaving dye on longer than directed won't make it lighter — it raises the risk of irritation and damage. Some boxes list a longer time for resistant gray; use it only if yours does.",
  });
  add({
    id: "reaction",
    phase: "apply",
    kind: "stop",
    title: "If it burns, itches or stings: rinse it out now",
    detail: "Wash your hair and scalp thoroughly with mild shampoo. Call emergency services if your lips, mouth, tongue or throat swell or you struggle to breathe. Reactions can also appear up to 72 hours later.",
  });

  // ---- After ----
  add({
    id: "rinse",
    phase: "after",
    kind: "action",
    title: "Rinse until the water runs clear, then condition",
    detail: "Rinse your scalp well and use the conditioner from the box. If dye gets in your eyes, rinse with plenty of water and get medical help.",
  });
  if (options.toner) {
    add({
      id: "toner",
      phase: "after",
      kind: "action",
      title: `Tone with a ${options.toner.name} (${options.toner.code}) demi-permanent`,
      detail: "Follow the toner's own instructions and timing. Toner deposits color only — it neutralizes warmth but won't lighten.",
    });
  }
  if (flags.has("brassy")) {
    add({
      id: "brass-care",
      phase: "after",
      kind: "tip",
      title: p.lengths.level >= 7 ? "Keep brass down with a purple shampoo" : "Keep orange tones down with a blue shampoo",
      detail: "Use it once or twice a week instead of your regular shampoo. Color-safe, sulfate-free shampoos help the color last.",
    });
  }
  add({
    id: "care",
    phase: "after",
    kind: "tip",
    title: "Help the color last",
    detail: "Wash with cool water and a color-safe shampoo, use heat protection, and rinse after swimming — chlorine can turn light hair green.",
  });
  add({
    id: "regrowth",
    phase: "after",
    kind: "tip",
    when: "Every 4–8 weeks",
    title: "Plan your root touch-ups",
    detail: "Retouch regrowth only, and run a new DyeCast check if your hair has changed.",
  });

  return { professional: steps.some((s) => s.kind === "stop" && s.id.startsWith("stop-")), steps };
}
