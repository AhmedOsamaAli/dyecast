/** Hair length and density: user-selectable classes, with mapping from YouCam detection terms. */

export const LENGTH_CLASSES = ["very-short", "short", "medium", "long", "very-long"] as const;
export type LengthClass = (typeof LENGTH_CLASSES)[number];

export const DENSITY_CLASSES = ["low", "medium", "high"] as const;
export type DensityClass = (typeof DENSITY_CLASSES)[number];

export const LENGTH_LABELS: Record<LengthClass, string> = {
  "very-short": "Very short (pixie, above the ears)",
  short: "Short (ear to chin)",
  medium: "Medium (to the shoulders)",
  long: "Long (past the shoulders)",
  "very-long": "Very long (mid-back or longer)",
};

export const DENSITY_LABELS: Record<DensityClass, string> = {
  low: "Thin — scalp shows easily",
  medium: "Average",
  high: "Thick — lots of hair",
};

/** YouCam Hair Length Detection terms (8 classes). */
const YOUCAM_LENGTH: Record<string, LengthClass> = {
  "above the ears": "very-short",
  "ear length": "very-short",
  "ear length or longer": "short",
  "short hair": "short",
  "short hair or longer": "medium",
  "above chest": "medium",
  "above chest or longer": "long",
  "long hair": "long",
};

/** YouCam Hair Density Detection terms (4 classes). */
const YOUCAM_DENSITY: Record<string, DensityClass> = {
  "Extremely Low Density": "low",
  "Low Density": "low",
  "Medium Density": "medium",
  "High Density": "high",
};

export function lengthFromYouCam(term: string | null | undefined): LengthClass | undefined {
  return term ? YOUCAM_LENGTH[term] : undefined;
}

export function densityFromYouCam(term: string | null | undefined): DensityClass | undefined {
  return term ? YOUCAM_DENSITY[term] : undefined;
}

const BOXES: Record<LengthClass, Record<DensityClass, number>> = {
  "very-short": { low: 1, medium: 1, high: 1 },
  short: { low: 1, medium: 1, high: 1 },
  medium: { low: 1, medium: 1, high: 2 },
  long: { low: 2, medium: 2, high: 3 },
  "very-long": { low: 2, medium: 3, high: 3 },
};

export interface BoxesAdvice {
  boxes: number;
  note: string;
}

export function boxesNeeded(length?: LengthClass, density?: DensityClass): BoxesAdvice {
  if (!length) {
    return {
      boxes: 1,
      note: "One box for short hair. If your hair is past your shoulders or thick, buy a second box before you start.",
    };
  }
  const boxes = BOXES[length][density ?? "medium"];
  const note =
    boxes > 1
      ? `Buy ${boxes} boxes of the same shade before you start — running out halfway leaves patchy color.`
      : "One box should cover your hair. Keep a spare if your hair is thicker than average.";
  return { boxes, note };
}
