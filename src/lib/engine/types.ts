import type { Lab } from "@/lib/color";

export type ToneId =
  | "natural"
  | "ash"
  | "violet"
  | "pearl"
  | "blue"
  | "matte"
  | "gold"
  | "copper"
  | "red"
  | "mahogany"
  | "beige"
  | "mocha"
  | "warm";

/** How the digits/letters after the level are read. Brands differ, so the user can switch. */
export type ToneSystemId = "international" | "wella" | "schwarzkopf" | "us-letter";

export type ProductType = "semi" | "demi" | "permanent" | "high-lift";
export type ShadeRole = "color" | "toner";

export type HairHistory = "virgin" | "dyed" | "highlighted" | "bleached" | "henna";
export type GrayShare = "none" | "some" | "half" | "most";
export type EndsCondition = "healthy" | "dry" | "damaged";
/** How the current hair color reads: user-selected, or suggested from a photo. */
export type HairTone = "warm" | "neutral" | "cool" | "red";
export type HairTexture = "straight" | "wavy" | "curly" | "coily";
export type StrandThickness = "fine" | "medium" | "coarse";

export interface ShadeTones {
  primary: ToneId;
  secondary?: ToneId;
  intense?: boolean;
}

export interface DecodedShade {
  /** Normalized display code, e.g. "7.13", "6G", "11.1". */
  code: string;
  /** Target lightness level on the 1–10 scale. */
  level: number;
  /** Printed series number (11/12 = high-lift blonde series). */
  series: number;
  tones: ShadeTones;
  system: ToneSystemId;
  name: string;
  suggestedProduct?: ProductType;
  /** Human explanation of how the code was read (shown when ambiguous). */
  note?: string;
}

export interface DecodeResult {
  ok: boolean;
  interpretations: DecodedShade[];
  /** Product type hinted by words like "demi", "toner", "high lift". */
  productHint?: ProductType;
  error?: string;
}

/**
 * Everything the engine needs to know about a person's hair. Every field can be selected by the
 * user; a photo only pre-fills suggestions (lengthsLab, level, tone) that the user confirms or edits.
 */
export interface HairProfileInput {
  /** Current level of the lengths (what most of the hair looks like today). Fractional allowed. */
  lengthsLevel: number;
  /** Measured color of the lengths from a photo, if available. */
  lengthsLab?: Lab;
  /** How the current color reads; used to describe the color when no photo was measured. */
  currentTone?: HairTone;
  /** Natural level at the roots (equals lengthsLevel for virgin hair). */
  naturalLevel: number;
  naturalTone?: HairTone;
  history: HairHistory;
  gray: GrayShare;
  ends: EndsCondition;
  texture?: HairTexture;
  thickness?: StrandThickness;
  /** True once the user picked or confirmed the level on the swatch strip. */
  levelConfirmed?: boolean;
}

export type FlagId =
  | "brassy"
  | "darker"
  | "lighter"
  | "no-change"
  | "stalled"
  | "hot-roots"
  | "muddy"
  | "gray-blend"
  | "uneven-ends"
  | "patchy"
  | "needs-bleach"
  | "henna-risk";

export interface Reason {
  rule: string;
  title: string;
  detail: string;
}

export interface ZoneResult {
  hex: string;
  lab: Lab;
  /** Lightness level actually reached. */
  level: number;
  startLevel: number;
  /** Levels lifted (0 when only depositing). */
  lift: number;
}

export type Verdict = "close" | "different" | "very-different";
export type ConfidenceLabel = "high" | "medium" | "low";

/** Strands that look visibly different from the rest of the lengths. */
export interface Streaks {
  kind: "highlights" | "gray";
  hex: string;
  /** Share of strands (0–1) with this color. */
  share: number;
}

export interface PredictedStreaks extends Streaks {
  /** Color of the other strands (the lengths hex is the average of both groups). */
  baseHex: string;
}

export interface Prediction {
  shade: DecodedShade;
  product: ProductType;
  promise: { hex: string; lab: Lab; level: number };
  roots: ZoneResult;
  lengths: ZoneResult;
  /** Roots and lengths end up visibly different. */
  twoZone: boolean;
  /** Highlights or gray that stay visibly different after coloring (absent in older saved checks). */
  streaks?: PredictedStreaks;
  overallHex: string;
  gap: number;
  rootsGap: number;
  lengthsGap: number;
  verdict: Verdict;
  flags: FlagId[];
  reasons: Reason[];
  confidence: number;
  confidenceLabel: ConfidenceLabel;
}
