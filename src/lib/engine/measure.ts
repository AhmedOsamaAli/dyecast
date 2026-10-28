import { clamp, type Lab } from "@/lib/color";
import { levelFromLightness, naturalLab, roundLevel } from "./levels";
import { UNPIGMENTED } from "./predict";
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
  adjustedByClass: boolean;
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

/** Turns a measured hair color (+ optional YouCam class) into suggestions the user then confirms or edits. */
export function suggestFromLab(lab: Lab, hairClass?: string): LevelSuggestion {
  const seen = lab.L + CAMERA_L_OFFSET;
  let raw = levelFromLightness(seen);
  let confidence = 0.7;
  const chroma = Math.hypot(lab.a, lab.b);

  // Salt-and-pepper hair: gray strands make the average lighter and almost colorless. Natural hair this light
  // is never that desaturated (ash blondes keep about half their chroma), so estimate the level of the pigmented
  // strands from the mix instead of reading the average as a lighter, ashy shade.
  const seenRef = naturalLab(raw);
  const grayMix = raw >= 4 && raw <= 9 && chroma < 7 && chroma < Math.hypot(seenRef.a, seenRef.b) * 0.35;
  let suggestGray: GrayShare | undefined = hairClass === "Grey/White" ? "most" : undefined;
  if (grayMix) {
    const share = raw >= 8 ? 0.8 : 0.5;
    raw = levelFromLightness((seen - share * UNPIGMENTED.L) / (1 - share));
    suggestGray ??= share >= 0.8 ? "most" : "half";
    confidence -= 0.15;
  }

  let level = raw;
  let adjusted = false;
  if (isHairClass(hairClass)) {
    const [lo, hi] = CLASS_RANGE[hairClass];
    if (raw < lo || raw > hi) {
      level = clamp(raw, lo, hi);
      confidence -= 0.25;
      adjusted = true;
    }
  }
  const ref = naturalLab(level);
  const refChroma = Math.hypot(ref.a, ref.b);
  const hue = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  // YouCam's class can mistake warm light for red hair (it called very dark brown hair "Auburn" in a live test),
  // so a red class only counts when the measured color shows some warmth too.
  const redClass = hairClass === "Red" || hairClass === "Auburn";
  let tone: HairTone = "neutral";
  if ((chroma > refChroma + 8 && hue < 52) || (redClass && chroma > refChroma + 3 && hue < 65)) tone = "red";
  else if (chroma > refChroma + 4) tone = "warm";
  // Very dark hair always looks desaturated in photos, so "cool" is only suggested from level 4 up.
  else if (!grayMix && level >= 4 && chroma < refChroma * 0.55) tone = "cool";
  return {
    level: roundLevel(level),
    rawLevel: raw,
    tone,
    confidence: clamp(confidence, 0.2, 0.9),
    adjustedByClass: adjusted,
    suggestGray,
  };
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
    adjustedByClass: false,
    suggestGray: hairClass === "Grey/White" ? "most" : undefined,
  };
}
