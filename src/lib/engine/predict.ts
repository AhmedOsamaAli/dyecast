import { clamp, deltaE2000, labToHex, mixLab, type Lab } from "@/lib/color";
import {
  magnitude,
  naturalLab,
  roundLevel,
  underlyingLab,
  underlyingName,
  warmthExcess,
  type AB,
} from "./levels";
import { PRODUCTS, type ProductDef } from "./products";
import { complementUnit, isCool, isWarm, toneVector, TONES } from "./tones";
import type {
  ConfidenceLabel,
  DecodedShade,
  FlagId,
  GrayShare,
  HairProfileInput,
  HairTone,
  PredictedStreaks,
  Prediction,
  ProductType,
  Reason,
  ShadeTones,
  StrandThickness,
  Verdict,
  ZoneResult,
} from "./types";

export const GRAY_FRACTION: Record<GrayShare, number> = { none: 0, some: 0.2, half: 0.5, most: 0.8 };
/** Unpigmented (white/gray) hair: light with a slight yellow cast. */
export const UNPIGMENTED: Lab = { L: 82, a: 0.5, b: 6 };
/** Share of strands that are highlighted in "highlighted" hair. */
export const HIGHLIGHT_SHARE = 0.35;
/** Fine hair lifts faster; coarse hair resists (levels added to the product's lift). */
const THICKNESS_LIFT: Record<StrandThickness, number> = { fine: 0.5, medium: 0, coarse: -0.5 };
/** Strand groups this far apart (ΔE00) are drawn as visible streaks. */
const STREAK_GAP = 8;

/** Level of the highlighted strands, from the overall lengths level and the natural level. */
export function highlightLevel(profile: Pick<HairProfileInput, "lengthsLevel" | "naturalLevel">): number {
  return Math.min(10, Math.max(profile.lengthsLevel + 1.5, profile.naturalLevel + 3));
}

export const GAP_CLOSE = 6;
export const GAP_DIFFERENT = 12;

/** The color the box promises: the shade on ideal hair of the target level. */
export function shadeIdealLab(level: number, tones: ShadeTones): Lab {
  const ref = naturalLab(level);
  const family = TONES[tones.primary].family;
  // Toned shades keep most of hair's natural yellow (even ash blondes); the tone's own pigment shifts it.
  const keep = family === "neutral" ? 1 : 0.8;
  const scale = (0.5 + 0.05 * level) * (tones.intense ? 1.4 : 1);
  const p = toneVector(tones.primary, scale);
  const s = tones.secondary ? toneVector(tones.secondary, scale * 0.5) : { a: 0, b: 0 };
  return { L: ref.L, a: ref.a * keep + p.a + s.a, b: ref.b * keep + p.b + s.b };
}

/** Color of hair described by level + tone (used when the user selects instead of measuring). */
export function describedHairLab(level: number, tone: HairTone = "neutral"): Lab {
  const n = naturalLab(level);
  switch (tone) {
    case "warm":
      return mixLab(n, underlyingLab(level), 0.35);
    case "red": {
      const r = mixLab(n, underlyingLab(level), 0.6);
      return { L: r.L, a: r.a + 6, b: r.b - 2 };
    }
    case "cool":
      return { L: n.L, a: n.a * 0.45, b: n.b * 0.45 };
    default:
      return n;
  }
}

interface Neutralized {
  residual: AB;
  /** Share (0–1) of the shade's cool-tone capacity used up cancelling the warmth. */
  toneUse: number;
}

function cancelWarmth(excess: AB, tones: ShadeTones, product: ProductDef, designLevel: number, strength: number): Neutralized {
  const design = magnitude(warmthExcess(designLevel));
  let residual = { ...excess };
  const cancelAlong = (dir: AB, amount: number): number => {
    const projection = residual.a * dir.a + residual.b * dir.b;
    if (projection <= 0 || amount <= 0) return 0;
    const c = Math.min(projection, amount);
    residual = { a: residual.a - dir.a * c, b: residual.b - dir.b * c };
    return c;
  };
  const m = magnitude(residual);
  if (m > 0) {
    cancelAlong({ a: residual.a / m, b: residual.b / m }, product.formulaNeutralization * design * strength);
  }
  const weighted: Array<[ShadeTones["primary"], number]> = [[tones.primary, 1]];
  if (tones.secondary) weighted.push([tones.secondary, 0.5]);
  let capacity = 0;
  let used = 0;
  for (const [id, weight] of weighted) {
    const tone = TONES[id];
    if (tone.neutralizes <= 0) continue;
    const amount = tone.neutralizes * weight * (tones.intense ? 1.3 : 1) * design * strength;
    capacity += amount;
    used += cancelAlong(complementUnit(id), amount);
  }
  return { residual, toneUse: capacity > 0 ? used / capacity : 0 };
}

/**
 * Cancels warmth with the shade's cool tones (complementary colors) plus the formula's built-in control.
 * A shade can only cancel the amount of warmth it was designed for (its own target level), which is why
 * a level-9 ash cannot neutralize the much stronger orange exposed at level 6–7.
 */
export function neutralize(excess: AB, tones: ShadeTones, product: ProductDef, designLevel: number, strength = 1): AB {
  return cancelWarmth(excess, tones, product, designLevel, strength).residual;
}

type ZoneMode = "lift" | "deposit-lighter" | "deposit";

interface ZoneOutcome {
  lab: Lab;
  level: number;
  lift: number;
  mode: ZoneMode;
  capacity: number;
  muddy: boolean;
}

interface ZoneArgs {
  startLevel: number;
  startLab: Lab;
  canLift: boolean;
  heat: boolean;
  liftBonus: number;
  /** Pre-lightened (bleached or highlighted) hair has lost its warm pigments. */
  lightened?: boolean;
}

function processZone(args: ZoneArgs, shade: DecodedShade, product: ProductDef): ZoneOutcome {
  const target = shade.level;
  const { tones } = shade;

  if (target > args.startLevel + 0.25) {
    const capacity = args.canLift ? Math.max(0, product.lift(args.startLevel) + args.liftBonus) : 0;
    if (capacity < 0.25) {
      // R1 / R6: nothing lightens; the dye only adds a little tone.
      const ideal = shadeIdealLab(args.startLevel, tones);
      const nat = naturalLab(args.startLevel);
      const k = product.depositOnly;
      const lab = {
        L: args.startLab.L - (product.id === "semi" ? 0.5 : 1.5),
        a: args.startLab.a + (ideal.a - nat.a) * k,
        b: args.startLab.b + (ideal.b - nat.b) * k,
      };
      return { lab, level: args.startLevel, lift: 0, mode: "deposit-lighter", capacity, muddy: false };
    }
    // R3 lift cap, R4 underlying pigment, R5 neutralization, R7 heat at the scalp.
    const heat = args.heat ? 0.4 : 0;
    const reached = Math.min(target + heat, args.startLevel + capacity + heat);
    const lift = reached - args.startLevel;
    const exposure = clamp(lift / 2, 0, 1) * (args.heat ? 1.2 : 1);
    const raw = warmthExcess(reached);
    const { residual, toneUse } = cancelWarmth({ a: raw.a * exposure, b: raw.b * exposure }, tones, product, target, 1);
    const nat = naturalLab(reached);
    // Cool pigment used up cancelling exposed warmth can't also cool the result.
    const base = mixLab(shadeIdealLab(reached, tones), nat, toneUse);
    return {
      lab: { L: nat.L, a: base.a + residual.a, b: base.b + residual.b },
      level: reached,
      lift,
      mode: "lift",
      capacity,
      muddy: false,
    };
  }

  // R2: same level or darker deposits well; R10: big jumps darker on light hair turn murky.
  let lab = mixLab(args.startLab, shadeIdealLab(target, tones), product.coverage);
  const warmTone = isWarm(tones.primary) || (tones.secondary ? isWarm(tones.secondary) : false);
  const muddy = args.startLevel >= 7 && args.startLevel - target >= 3 && !warmTone;
  if (muddy) {
    // Without warm pigment underneath, a cool/neutral brown reads flat and khaki-green — most on pre-lightened hair.
    const k = args.lightened ? 1 : 0.5;
    lab = { L: lab.L - 2.5 * k, a: lab.a - 6.5 * k, b: lab.b + 0.5 * k };
  }
  return { lab, level: target, lift: 0, mode: "deposit", capacity: 0, muddy };
}

/** Color of gray (unpigmented) strands after this dye. */
function grayStrandLab(shade: DecodedShade, product: ProductDef, thickness: StrandThickness): Lab {
  const ideal = shadeIdealLab(shade.level, shade.tones);
  const cover = clamp(product.grayCoverage(shade.level) * (thickness === "coarse" ? 0.85 : 1), 0, 1);
  return mixLab(UNPIGMENTED, { L: ideal.L + 2, a: ideal.a * 1.15, b: ideal.b * 1.15 }, cover);
}

function applyGray(lab: Lab, fraction: number, shade: DecodedShade, product: ProductDef, thickness: StrandThickness): Lab {
  if (fraction <= 0) return lab;
  return mixLab(lab, grayStrandLab(shade, product, thickness), fraction);
}

/** How much warmer (more orange/red; positive) or cooler (negative) a result looks than the box promise. */
export function warmthDelta(result: Lab, promise: Lab): number {
  return (result.b - promise.b) * 0.7 + (result.a - promise.a) * 0.5;
}

function confidenceLabel(c: number): ConfidenceLabel {
  return c >= 0.72 ? "high" : c >= 0.5 ? "medium" : "low";
}

function verdictFor(gap: number): Verdict {
  return gap < GAP_CLOSE ? "close" : gap < GAP_DIFFERENT ? "different" : "very-different";
}

function toneWords(tones: ShadeTones): string {
  const parts = [TONES[tones.primary].label.toLowerCase()];
  if (tones.secondary) parts.push(TONES[tones.secondary].label.toLowerCase());
  return parts.join(" + ");
}

function lv(level: number): string {
  return `level ${roundLevel(level)}`;
}

/** Predicts the realistic result of a shade on this person's hair, with plain-language reasons. */
export function predict(profile: HairProfileInput, shade: DecodedShade, productType?: ProductType): Prediction {
  const product = PRODUCTS[productType ?? shade.suggestedProduct ?? "permanent"];
  const flags = new Set<FlagId>();
  const reasons: Reason[] = [];
  const add = (rule: string, title: string, detail: string) => reasons.push({ rule, title, detail });

  const target = shade.level;
  const thickness = profile.thickness ?? "medium";
  const liftBonus = THICKNESS_LIFT[thickness];
  const curly = profile.texture === "curly" || profile.texture === "coily";
  const porosity = profile.ends === "damaged" ? 2 : profile.ends === "dry" || curly || profile.history === "bleached" ? 1 : 0;
  const grayFraction = GRAY_FRACTION[profile.gray];

  const lengthsStartLab = profile.lengthsLab ?? describedHairLab(profile.lengthsLevel, profile.currentTone);
  const virgin = profile.history === "virgin";
  const rootsStartLevel = virgin ? profile.lengthsLevel : profile.naturalLevel;
  const rootsStartLab = virgin
    ? lengthsStartLab
    : describedHairLab(profile.naturalLevel, profile.naturalTone ?? "neutral");

  const promiseLab = shadeIdealLab(target, shade.tones);

  // Roots: virgin regrowth that processes faster because of scalp heat.
  const roots = processZone(
    { startLevel: rootsStartLevel, startLab: rootsStartLab, canLift: true, heat: true, liftBonus },
    shade,
    product,
  );

  // Lengths: depend on what has been done to them before.
  let lengths: ZoneOutcome;
  let patchyGap = 0;
  // Natural and highlighted strands, kept apart so stripes can be shown, not just averaged away.
  let strandGroups: { base: Lab; highlights: Lab } | undefined;
  if (profile.history === "highlighted") {
    const base = processZone(
      { startLevel: profile.naturalLevel, startLab: rootsStartLab, canLift: true, heat: false, liftBonus },
      shade,
      product,
    );
    const hlLevel = highlightLevel(profile);
    const highlights = processZone(
      { startLevel: hlLevel, startLab: underlyingLab(hlLevel), canLift: true, heat: false, liftBonus, lightened: true },
      shade,
      product,
    );
    patchyGap = deltaE2000(base.lab, highlights.lab);
    strandGroups = { base: base.lab, highlights: highlights.lab };
    lengths = {
      ...base,
      lab: mixLab(base.lab, highlights.lab, HIGHLIGHT_SHARE),
      level: base.level * (1 - HIGHLIGHT_SHARE) + highlights.level * HIGHLIGHT_SHARE,
    };
  } else {
    const canLift = profile.history === "virgin" || profile.history === "bleached";
    lengths = processZone(
      { startLevel: profile.lengthsLevel, startLab: lengthsStartLab, canLift, heat: false, liftBonus, lightened: profile.history === "bleached" },
      shade,
      product,
    );
  }

  const mixedLengths = lengths.lab;
  // R9: porous ends (dry, damaged, curly/coily, bleached) grab extra color when depositing.
  if (porosity > 0 && lengths.mode !== "lift") {
    const grab = isCool(shade.tones.primary) ? toneVector(shade.tones.primary, 0.15 * porosity) : { a: 0, b: 0 };
    lengths = {
      ...lengths,
      lab: { L: lengths.lab.L - 1.5 * porosity, a: lengths.lab.a + grab.a, b: lengths.lab.b + grab.b },
    };
  }
  // R11: fine hair absorbs deposit faster and can go a touch darker.
  if (thickness === "fine") {
    for (const z of [roots, lengths]) if (z.mode === "deposit") z.lab = { ...z.lab, L: z.lab.L - 1 };
  }
  // Porosity and fine-hair effects apply to every strand in the lengths alike.
  const shifted = (lab: Lab): Lab => ({
    L: lab.L + lengths.lab.L - mixedLengths.L,
    a: lab.a + lengths.lab.a - mixedLengths.a,
    b: lab.b + lengths.lab.b - mixedLengths.b,
  });

  // R8: gray. Previously colored lengths already had their gray covered.
  const rootsLab = applyGray(roots.lab, grayFraction, shade, product, thickness);
  const lengthsGray = virgin || profile.history === "highlighted" ? grayFraction : grayFraction * 0.3;
  const lengthsLab = applyGray(lengths.lab, lengthsGray, shade, product, thickness);

  // Visible strand groups. Their share-weighted mix is exactly lengthsLab.
  let streaks: PredictedStreaks | undefined;
  if (strandGroups && patchyGap > STREAK_GAP) {
    const base = applyGray(shifted(strandGroups.base), lengthsGray, shade, product, thickness);
    const highlights = applyGray(shifted(strandGroups.highlights), lengthsGray, shade, product, thickness);
    streaks = { kind: "highlights", hex: labToHex(highlights), baseHex: labToHex(base), share: HIGHLIGHT_SHARE };
  } else if (lengthsGray >= 0.1) {
    const grayLab = grayStrandLab(shade, product, thickness);
    if (deltaE2000(grayLab, lengths.lab) > STREAK_GAP) {
      streaks = { kind: "gray", hex: labToHex(grayLab), baseHex: labToHex(lengths.lab), share: lengthsGray };
    }
  }

  const lengthsGap = deltaE2000(promiseLab, lengthsLab);
  const rootsGap = deltaE2000(promiseLab, rootsLab);
  const gap = 0.7 * lengthsGap + 0.3 * rootsGap;
  const twoZone = deltaE2000(rootsLab, lengthsLab) >= 5;

  // ---- Flags and reasons ----
  const lighter = target > Math.min(rootsStartLevel, profile.lengthsLevel) + 0.25;

  if (lengths.mode === "deposit-lighter" || roots.mode === "deposit-lighter") {
    const depositZone = lengths.mode === "deposit-lighter" ? lengths : roots;
    const startLab = lengths.mode === "deposit-lighter" ? lengthsStartLab : rootsStartLab;
    if (deltaE2000(startLab, depositZone.lab) < 6) flags.add("no-change");
    if (!product.lift(5)) {
      add("R1", `${product.label} can't lighten`, `${product.label} color has no lifting power — it can only add tone or go darker. Your hair stays around ${lv(depositZone.level)}.`);
    }
  }

  if (lighter && product.lift(5) > 0) {
    const liftZone = roots.mode === "lift" ? roots : lengths;
    if (liftZone.mode === "lift") {
      const stalled = liftZone.level < target - 0.5;
      if (stalled) flags.add("stalled");
      add(
        "R3",
        stalled ? "This box can't lift your hair that far" : "Within this box's lifting range",
        `${product.label} dye lifts about ${roundLevel(liftZone.capacity)} levels on hair like yours. You start at ${lv(liftZone.level - liftZone.lift)}; this shade is level ${target}${stalled ? `, so expect to stop around ${lv(liftZone.level)}` : ""}.`,
      );
      if (liftZone.lift >= 1) {
        add(
          "R4",
          "Lightening exposes warm pigment",
          `At about ${lv(liftZone.level)}, lightened hair shows ${underlyingName(liftZone.level)} underneath.`,
        );
        const cool = isCool(shade.tones.primary) || (shade.tones.secondary ? isCool(shade.tones.secondary) : false);
        add(
          "R5",
          cool ? "The cool tone cancels only part of it" : "Nothing in this shade cancels that warmth",
          cool
            ? `The ${toneWords(shade.tones)} in ${shade.code} is balanced for level ${target}. It can't fully neutralize the stronger ${underlyingName(liftZone.level)} at ${lv(liftZone.level)}.`
            : `${shade.code} is a ${toneWords(shade.tones)} shade, so the exposed ${underlyingName(liftZone.level)} adds to its warmth.`,
        );
      }
    }
  }

  if (!virgin && profile.history !== "highlighted" && profile.history !== "bleached" && target > profile.lengthsLevel + 0.25) {
    add(
      "R6",
      "Color can't lift color",
      "Your lengths already have dye in them. New dye won't lighten previous color — only your roots will lighten. Lifting old color needs a color remover or lightener.",
    );
    if (target > profile.lengthsLevel + 1) flags.add("needs-bleach");
  }

  if (roots.mode === "lift" && rootsLab.L - lengthsLab.L > 3) {
    flags.add("hot-roots");
    add(
      "R7",
      "Hot roots",
      virgin
        ? "Heat from your scalp makes roots process faster, so they can come out lighter and warmer than your lengths. Apply to mid-lengths and ends first and roots for the last 10–15 minutes."
        : "Your roots are natural (they lift), but your colored lengths won't — so roots will look lighter and warmer than the rest.",
    );
  }

  if (grayFraction >= 0.5 && product.grayCoverage(target) * (thickness === "coarse" ? 0.85 : 1) < 0.8) {
    flags.add("gray-blend");
    add(
      "R8",
      "Gray will blend, not fully cover",
      `${product.label} color at level ${target} covers gray only partly${thickness === "coarse" ? ", and coarse gray is resistant" : ""}. Expect grays to look lighter, like soft highlights.`,
    );
  } else if (grayFraction > 0) {
    add("R8", "Gray takes the color more literally", "Gray hairs have no natural pigment, so they show the dye's tone more brightly than the rest.");
  }

  if (porosity > 0) {
    flags.add("uneven-ends");
    add(
      "R9",
      "Porous ends grab more color",
      `${curly ? "Curly and coily hair tends to be more porous. " : ""}Dry or damaged ends absorb extra dye and can turn darker or duller than the roots. A strand test on the ends is worth it.`,
    );
  }

  if (roots.muddy || lengths.muddy) {
    flags.add("muddy");
    add(
      "R10",
      "Going much darker on light hair",
      "Very light hair has lost its warm pigments. A big jump darker with a cool or neutral shade can look flat, murky or slightly green and fade fast. Colorists add a warm 'filler' first.",
    );
  }

  if (thickness !== "medium") {
    add(
      "R11",
      thickness === "fine" ? "Fine hair processes fast" : "Coarse hair resists color",
      thickness === "fine"
        ? "Fine strands lift and absorb dye quickly — results can be lighter when lifting and darker when depositing. Watch the timing."
        : "Coarse strands resist lightening and gray coverage, so expect a little less lift.",
    );
  }

  if (profile.history === "highlighted" && patchyGap > STREAK_GAP) {
    flags.add("patchy");
    add(
      "R12",
      "Highlights take the dye differently",
      "Your highlighted strands are lighter and more porous than the rest, so expect visible stripes rather than one even color.",
    );
  }

  if (profile.history === "henna") {
    flags.add("henna-risk");
    add(
      "R13",
      "Henna changes everything",
      "Henna coats the hair and can block or distort box dye. Compound henna may contain metallic salts that react with developer. Do a strand test and talk to a colorist first.",
    );
  }

  const maxBoxLift = PRODUCTS["high-lift"].lift(rootsStartLevel) + liftBonus;
  if (target - rootsStartLevel > maxBoxLift + 0.5) flags.add("needs-bleach");

  const warm = Math.max(warmthDelta(lengthsLab, promiseLab), warmthDelta(rootsLab, promiseLab));
  if (warm > 5) flags.add("brassy");
  if (lengthsLab.L < promiseLab.L - 6) flags.add("darker");
  if (lengthsLab.L > promiseLab.L + 6) flags.add("lighter");

  if (!lighter && !roots.muddy && !lengths.muddy) {
    add("R2", "Going darker or staying level deposits well", `Darker and same-level shades deposit evenly, so this result should look close to the box.`);
  }

  let confidence = 0.85;
  if (!profile.levelConfirmed) confidence -= 0.12;
  if (profile.history === "dyed") confidence -= 0.1;
  if (profile.history === "highlighted") confidence -= 0.12;
  if (profile.history === "bleached") confidence -= 0.06;
  if (profile.history === "henna") confidence -= 0.4;
  if (target - Math.min(rootsStartLevel, profile.lengthsLevel) >= 3) confidence -= 0.08;
  if (profile.gray === "most") confidence -= 0.07;
  if (profile.ends === "damaged") confidence -= 0.05;
  confidence = clamp(confidence, 0.2, 0.95);

  const zone = (z: ZoneOutcome, lab: Lab, startLevel: number): ZoneResult => ({
    hex: labToHex(lab),
    lab,
    level: z.level,
    startLevel,
    lift: z.lift,
  });

  const colorVerdict = verdictFor(gap);

  return {
    shade,
    product: product.id,
    promise: { hex: labToHex(promiseLab), lab: promiseLab, level: target },
    roots: zone(roots, rootsLab, rootsStartLevel),
    lengths: zone(lengths, lengthsLab, profile.lengthsLevel),
    twoZone,
    streaks,
    overallHex: labToHex(mixLab(lengthsLab, rootsLab, 0.25)),
    gap,
    rootsGap,
    lengthsGap,
    // R12: stripes can't match a box's even color, whatever their average looks like.
    verdict: flags.has("patchy") && colorVerdict === "close" ? "different" : colorVerdict,
    flags: [...flags],
    reasons,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
  };
}

/** Demi-permanent toner applied over an already-lightened result (deposit only, made for neutralizing). */
export function applyToner(lab: Lab, level: number, toner: DecodedShade): Lab {
  const nat = naturalLab(level);
  const residual = neutralize({ a: lab.a - nat.a, b: lab.b - nat.b }, toner.tones, PRODUCTS.demi, Math.max(level, toner.level), 1.6);
  const ideal = shadeIdealLab(level, toner.tones);
  return {
    L: lab.L - 1,
    a: nat.a + residual.a + (ideal.a - nat.a) * 0.3,
    b: nat.b + residual.b + (ideal.b - nat.b) * 0.3,
  };
}
