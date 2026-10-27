import type { AB } from "./levels";
import type { ToneId, ToneSystemId } from "./types";

export interface ToneDef {
  id: ToneId;
  label: string;
  /** Word used inside shade names, e.g. "Medium Ash Blonde". */
  adjective: string;
  family: "cool" | "warm" | "neutral";
  /** CIELAB hue angle (degrees) of the pigment this tone deposits. */
  hue: number;
  /** Chroma the tone adds on ideal hair. */
  chroma: number;
  /** Share of the warmth it was formulated for that it can cancel (complementary color theory). */
  neutralizes: number;
}

export const TONES: Record<ToneId, ToneDef> = {
  natural: { id: "natural", label: "Natural", adjective: "Natural", family: "neutral", hue: 70, chroma: 3, neutralizes: 0.25 },
  ash: { id: "ash", label: "Ash", adjective: "Ash", family: "cool", hue: 240, chroma: 6, neutralizes: 0.45 },
  blue: { id: "blue", label: "Cendré (blue ash)", adjective: "Cendré", family: "cool", hue: 255, chroma: 6, neutralizes: 0.45 },
  violet: { id: "violet", label: "Iridescent (violet)", adjective: "Iridescent", family: "cool", hue: 310, chroma: 7, neutralizes: 0.45 },
  pearl: { id: "pearl", label: "Pearl", adjective: "Pearl", family: "cool", hue: 285, chroma: 5, neutralizes: 0.4 },
  matte: { id: "matte", label: "Matte (green)", adjective: "Matte", family: "cool", hue: 165, chroma: 5, neutralizes: 0.4 },
  gold: { id: "gold", label: "Gold", adjective: "Golden", family: "warm", hue: 85, chroma: 14, neutralizes: 0 },
  copper: { id: "copper", label: "Copper", adjective: "Copper", family: "warm", hue: 55, chroma: 22, neutralizes: 0 },
  red: { id: "red", label: "Red", adjective: "Red", family: "warm", hue: 30, chroma: 24, neutralizes: 0 },
  mahogany: { id: "mahogany", label: "Mahogany", adjective: "Mahogany", family: "warm", hue: 15, chroma: 16, neutralizes: 0 },
  beige: { id: "beige", label: "Beige", adjective: "Beige", family: "neutral", hue: 75, chroma: 6, neutralizes: 0.15 },
  mocha: { id: "mocha", label: "Mocha (cool brown)", adjective: "Mocha", family: "neutral", hue: 50, chroma: 5, neutralizes: 0.15 },
  warm: { id: "warm", label: "Warm", adjective: "Warm", family: "warm", hue: 70, chroma: 10, neutralizes: 0 },
};

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Pigment vector the tone adds in the a*b* plane. */
export function toneVector(id: ToneId, scale: number): AB {
  const t = TONES[id];
  return { a: Math.cos(rad(t.hue)) * t.chroma * scale, b: Math.sin(rad(t.hue)) * t.chroma * scale };
}

/** Unit vector pointing at the warm hue a cool tone cancels (its complement). */
export function complementUnit(id: ToneId): AB {
  const h = rad(TONES[id].hue + 180);
  return { a: Math.cos(h), b: Math.sin(h) };
}

export function isWarm(id: ToneId): boolean {
  return TONES[id].family === "warm";
}

export function isCool(id: ToneId): boolean {
  return TONES[id].family === "cool";
}

/** Digit meanings after the level for each numbering system. */
export const TONE_DIGITS: Record<Exclude<ToneSystemId, "us-letter">, Record<string, ToneId>> = {
  // L'Oréal, Garnier, Revlon and most European box dyes: 7.1, 6,3, 63
  international: {
    "0": "natural",
    "1": "ash",
    "2": "violet",
    "3": "gold",
    "4": "copper",
    "5": "mahogany",
    "6": "red",
    "7": "matte",
    "8": "pearl",
    "9": "blue",
  },
  // Slash codes (e.g. 7/1): /2 matt, /4 red, /6 violet, /7 brown
  wella: {
    "0": "natural",
    "1": "ash",
    "2": "matte",
    "3": "gold",
    "4": "red",
    "5": "mahogany",
    "6": "violet",
    "7": "mocha",
    "8": "pearl",
    "9": "blue",
  },
  // Dash codes (e.g. 9-1): -1 cendré, -2 ash, -4 beige, -5 gold, -6 chocolate, -7 copper, -8 red, -9 violet
  schwarzkopf: {
    "0": "natural",
    "1": "blue",
    "2": "ash",
    "3": "matte",
    "4": "beige",
    "5": "gold",
    "6": "mocha",
    "7": "copper",
    "8": "red",
    "9": "violet",
  },
};

/** Letter suffixes used by many US brands (6G, 8A, 5NN, 7NA). */
export const TONE_LETTERS: Record<string, ToneId> = {
  N: "natural",
  A: "ash",
  V: "violet",
  P: "pearl",
  B: "beige",
  G: "gold",
  C: "copper",
  R: "red",
  M: "mocha",
  W: "warm",
};

export const TONE_SYSTEM_LABELS: Record<ToneSystemId, string> = {
  international: "International (7.1 — L'Oréal, Garnier, most box dyes)",
  wella: "Slash codes (7/1)",
  schwarzkopf: "Dash codes (9-1)",
  "us-letter": "Letter codes (6G, 8A, 5NN)",
};
