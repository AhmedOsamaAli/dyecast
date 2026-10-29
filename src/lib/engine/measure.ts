import { clamp, type Lab } from "@/lib/color";
import { levelFromLightness, naturalLab, roundLevel } from "./levels";
import { GRAY_FRACTION, UNPIGMENTED } from "./predict";
import type { GrayShare, HairTone } from "./types";

/** Hair in selfies usually reads darker than salon swatches; tunable calibration in L* units. */
export const CAMERA_L_OFFSET = 2;

/** YouCam Facial Color Tones `hair_color_name` classes. */
export const YOUCAM_HAIR_CLASSES = ["Auburn", "Black", "Blonde", "Brown", "Grey/White", "Red"] as const;
export type YouCamHairClass = (typeof YOUCAM_HAIR_CLASSES)[number];

const CLASS_RANGE: Record<YouCamHairClass, [number, number]> = {
  Black: [1, 2.5],
  Brown: [2, 6.5],
  Blonde: [6, 10],
  Auburn: [3, 7.5],
  Red: [4, 9],
  "Grey/White": [1, 10],
};

export interface LevelSuggestion {
  level: number;
  rawLevel: number;
  tone: HairTone;
  confidence: number;
  /** YouCam's hair class points to a clearly different level than the measured color (the measurement wins). */
  classDisagrees: boolean;
  suggestGray?: GrayShare;
}

function isHairClass(value: string | undefined): value is YouCamHairClass {
  return value !== undefined && (YOUCAM_HAIR_CLASSES as readonly string[]).includes(value);
}

/**
 * Robust hair color from segmented hair pixels: drops specular highlights (top 10% L*) and deep shadows
 * (bottom 15% L*), then takes the per-channel median of what remains.
 */
export function robustHairLab(pixels: Lab[]): Lab | null {
  if (pixels.length < 50) return null;
  const sorted = [...pixels].sort((p, q) => p.L - q.L);
  const kept = sorted.slice(Math.floor(sorted.length * 0.15), Math.ceil(sorted.length * 0.9));
  const median = (values: number[]) => {
    const v = [...values].sort((x, y) => x - y);
    const mid = v.length >> 1;
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  };
  return { L: median(kept.map((p) => p.L)), a: median(kept.map((p) => p.a)), b: median(kept.map((p) => p.b)) };
}

/** What a photo's hair pixels show beyond the typical color. */
export interface HairEvidence {
  /** Typical color of the pigmented strands, leaving out light, colorless (gray or white) pixels. */
  pigmented: Lab | null;
  /** Share of hair pixels that are light and almost colorless, like gray or white strands. */
  grayPixels: number;
  /** Share of hair pixels that are dark. */
  darkPixels: number;
}

export interface HairReading extends HairEvidence {
  /** Typical hair color (see robustHairLab). */
  lab: Lab;
}

const chromaOf = (lab: Lab) => Math.hypot(lab.a, lab.b);
const isGrayPixel = (p: Lab) => p.L >= 60 && chromaOf(p) <= 9;

/** Typical hair color plus the gray-strand evidence, from the confidently-hair pixels of a photo. */
export function readHair(pixels: Lab[]): HairReading | null {
  const lab = robustHairLab(pixels);
  if (!lab) return null;
  const pigmented = pixels.filter((p) => !isGrayPixel(p));
  return {
    lab,
    pigmented: robustHairLab(pigmented),
    grayPixels: (pixels.length - pigmented.length) / pixels.length,
    darkPixels: pixels.filter((p) => p.L <= 40).length / pixels.length,
  };
}

/** An average this light and this colorless isn't natural pigment: it's gray or white hair. */
function averageLooksGray(lab: Lab): GrayShare | undefined {
  const raw = levelFromLightness(lab.L + CAMERA_L_OFFSET);
  if (raw < 5 || chromaOf(lab) >= Math.min(7, chromaOf(naturalLab(raw)) * 0.3)) return undefined;
  return raw >= 8 ? "most" : "half";
}

/**
 * Gray strands. Photos make dark hair look dull, so dullness alone never means gray. YouCam's Grey/White class only
 * counts when the photo shows gray too (it has called plain dark hair gray). Without a class, many light colorless
 * strands next to dark ones (salt and pepper) suggest gray. When YouCam saw a hair color, partial gray is left for
 * the person to set.
 */
function graySuggestion(lab: Lab, hairClass: string | undefined, evidence?: HairEvidence): GrayShare | undefined {
  if (hairClass === "Grey/White") {
    if (!evidence) return averageLooksGray(lab);
    const gray = evidence.grayPixels;
    if (gray >= 0.5) return "most";
    if (gray >= 0.2) return "half";
    if (gray >= 0.06) return "some";
    return averageLooksGray(lab);
  }
  if (isHairClass(hairClass)) return undefined;
  if (evidence) {
    if (evidence.grayPixels < 0.25 || evidence.darkPixels < 0.15) return undefined;
    return evidence.grayPixels >= 0.45 ? "half" : "some";
  }
  return averageLooksGray(lab);
}

/** Turns a measured hair color (+ optional YouCam class and pixel evidence) into suggestions the user confirms. */
export function suggestFromLab(lab: Lab, hairClass?: string, evidence?: HairEvidence): LevelSuggestion {
  const suggestGray = graySuggestion(lab, hairClass, evidence);
  let confidence = suggestGray ? 0.55 : 0.7;
  // Salt and pepper in the strands: read the level and tone from the pigmented ones, even when the gray share is
  // left for the person to set, so light gray strands don't make dark hair read light and ashy.
  const saltAndPepper = Boolean(evidence && evidence.grayPixels >= 0.25 && evidence.darkPixels >= 0.15);
  let color = lab;
  let raw = levelFromLightness(lab.L + CAMERA_L_OFFSET);
  if ((suggestGray || saltAndPepper) && evidence?.pigmented) {
    color = evidence.pigmented;
    raw = levelFromLightness(color.L + CAMERA_L_OFFSET);
  } else if (suggestGray && raw >= 4) {
    const share = GRAY_FRACTION[suggestGray];
    raw = levelFromLightness((lab.L + CAMERA_L_OFFSET - share * UNPIGMENTED.L) / (1 - share));
  }

  // YouCam's quick class is a second opinion, never a limit: in tests it called light brown and dark blonde hair
  // "Black" and very dark brown hair "Auburn". The measured color decides; agreement raises confidence.
  const level = raw;
  let classDisagrees = false;
  if (isHairClass(hairClass)) {
    const [lo, hi] = CLASS_RANGE[hairClass];
    classDisagrees = raw < lo - 0.5 || raw > hi + 0.5;
    confidence += classDisagrees ? -0.15 : 0.1;
  }
  const chroma = chromaOf(color);
  const refChroma = chromaOf(naturalLab(level));
  const hue = (Math.atan2(color.b, color.a) * 180) / Math.PI;
  // YouCam's class can mistake warm light for red hair (it called very dark brown hair "Auburn" in a live test),
  // so a red class only counts when the measured color shows some warmth too.
  const redClass = hairClass === "Red" || hairClass === "Auburn";
  let tone: HairTone = "neutral";
  if ((chroma > refChroma + 8 && hue < 52) || (redClass && chroma > refChroma + 3 && hue < 65)) tone = "red";
  else if (chroma > refChroma + 4) tone = "warm";
  // Photos make brown hair look duller than it is, so "cool" (ash) is only suggested for blondes, from level 6 up.
  else if (!suggestGray && level >= 6 && chroma < refChroma * 0.55) tone = "cool";
  return {
    level: roundLevel(level),
    rawLevel: raw,
    tone,
    confidence: clamp(confidence, 0.2, 0.9),
    classDisagrees,
    suggestGray,
  };
}

/** Plain words for when YouCam's quick hair class and the color measured on this device don't match. */
export function classNote(hairClass: string | undefined, suggestion: LevelSuggestion): string | undefined {
  if (!isHairClass(hairClass)) return undefined;
  if (hairClass === "Grey/White" && !suggestion.suggestGray) {
    return "YouCam's quick check said gray or white, but this photo shows few light, colorless strands. If you have gray, set Gray share yourself.";
  }
  if (!suggestion.classDisagrees) return undefined;
  const lighter = suggestion.rawLevel > CLASS_RANGE[hairClass][1];
  return `YouCam's quick check said ${hairClass.toLowerCase()}, but the color measured on this device reads ${lighter ? "lighter" : "darker"}, so the suggestion follows the measurement. Compare it with your hair in daylight.`;
}

/** Suggestion when only YouCam's hair class is available (no on-device measurement). */
export function suggestFromHairClass(hairClass: string): LevelSuggestion | null {
  if (!isHairClass(hairClass)) return null;
  const [lo, hi] = CLASS_RANGE[hairClass];
  return {
    level: roundLevel((lo + hi) / 2),
    rawLevel: (lo + hi) / 2,
    tone: hairClass === "Red" || hairClass === "Auburn" ? "red" : "neutral",
    confidence: 0.35,
    classDisagrees: false,
    suggestGray: hairClass === "Grey/White" ? "most" : undefined,
  };
}
