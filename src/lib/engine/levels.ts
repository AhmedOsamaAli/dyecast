import { clamp, lchToLab, mixLab, type Lab, type LCh } from "@/lib/color";

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 10;

/** Professional level names (1 = black … 10 = lightest blonde). Box names vary by brand; the number is what counts. */
export const LEVEL_NAMES = [
  "",
  "Black",
  "Darkest Brown",
  "Dark Brown",
  "Medium Brown",
  "Light Brown",
  "Dark Blonde",
  "Medium Blonde",
  "Light Blonde",
  "Very Light Blonde",
  "Lightest Blonde",
] as const;

/**
 * Approximate appearance of natural, untreated hair at each level (CIELAB LCh).
 * Hue drifts from red-brown (dark) toward yellow (light); chroma stays low because eumelanin dominates.
 */
const NATURAL: readonly LCh[] = [
  { L: 0, C: 0, h: 0 },
  { L: 9, C: 3, h: 50 },
  { L: 14, C: 6, h: 55 },
  { L: 20, C: 9, h: 58 },
  { L: 27, C: 12, h: 60 },
  { L: 34, C: 15, h: 63 },
  { L: 42, C: 18, h: 66 },
  { L: 51, C: 20, h: 70 },
  { L: 61, C: 21, h: 74 },
  { L: 71, C: 21, h: 78 },
  { L: 81, C: 18, h: 82 },
];

/**
 * Underlying (contributing) pigment exposed when hair is lightened to each level:
 * red-brown → red → red-orange → orange → orange-gold → gold → yellow → pale yellow.
 * Same lightness as the natural reference, much higher chroma (pheomelanin left behind).
 */
const UNDERLYING: readonly LCh[] = [
  { L: 0, C: 0, h: 0 },
  { L: 9, C: 6, h: 35 },
  { L: 14, C: 10, h: 35 },
  { L: 20, C: 16, h: 38 },
  { L: 27, C: 23, h: 40 },
  { L: 34, C: 30, h: 47 },
  { L: 42, C: 36, h: 56 },
  { L: 51, C: 38, h: 65 },
  { L: 61, C: 36, h: 74 },
  { L: 71, C: 31, h: 82 },
  { L: 81, C: 23, h: 88 },
];

export const UNDERLYING_NAMES = [
  "",
  "dark red-brown",
  "dark red-brown",
  "red-brown",
  "red",
  "red-orange",
  "orange",
  "orange-gold",
  "gold",
  "yellow",
  "pale yellow",
] as const;

function interpolate(table: readonly LCh[], level: number): Lab {
  const l = clamp(level, MIN_LEVEL, MAX_LEVEL);
  const lo = Math.floor(l);
  const hi = Math.min(MAX_LEVEL, lo + 1);
  return mixLab(lchToLab(table[lo]), lchToLab(table[hi]), l - lo);
}

/** Reference color of natural hair at a (fractional) level. */
export function naturalLab(level: number): Lab {
  return interpolate(NATURAL, level);
}

/** Color of hair lightened to a (fractional) level before any toning. */
export function underlyingLab(level: number): Lab {
  return interpolate(UNDERLYING, level);
}

export type AB = { a: number; b: number };

/** Extra warmth (a*, b*) lightened hair shows compared with natural hair of the same level. */
export function warmthExcess(level: number): AB {
  const u = underlyingLab(level);
  const n = naturalLab(level);
  return { a: u.a - n.a, b: u.b - n.b };
}

export function magnitude(v: AB): number {
  return Math.hypot(v.a, v.b);
}

/** Inverts the natural lightness table: CIELAB L* → fractional level (clamped to 1–10). */
export function levelFromLightness(L: number): number {
  if (L <= NATURAL[MIN_LEVEL].L) return MIN_LEVEL;
  if (L >= NATURAL[MAX_LEVEL].L) return MAX_LEVEL;
  for (let i = MIN_LEVEL; i < MAX_LEVEL; i++) {
    const lo = NATURAL[i].L;
    const hi = NATURAL[i + 1].L;
    if (L >= lo && L <= hi) return i + (L - lo) / (hi - lo);
  }
  return MAX_LEVEL;
}

export function levelName(level: number): string {
  return LEVEL_NAMES[Math.round(clamp(level, MIN_LEVEL, MAX_LEVEL))];
}

export function underlyingName(level: number): string {
  return UNDERLYING_NAMES[Math.round(clamp(level, MIN_LEVEL, MAX_LEVEL))];
}

/** Rounds to the nearest half level for display ("about level 6.5"). */
export function roundLevel(level: number): number {
  return Math.round(level * 2) / 2;
}
