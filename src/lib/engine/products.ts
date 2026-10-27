import type { ProductType } from "./types";

export interface ProductDef {
  id: ProductType;
  label: string;
  short: string;
  /** Levels the product can lighten natural (virgin) hair from a given starting level. */
  lift: (startLevel: number) => number;
  /** How strongly color deposits when going darker or depositing tone (0–1). */
  coverage: number;
  /** Strength of tone deposit when the product cannot lift (0–1). */
  depositOnly: number;
  /** Built-in warmth control of the formula, as a share of the warmth it was designed for. */
  formulaNeutralization: number;
  /** Share of gray hair covered, by target level. */
  grayCoverage: (targetLevel: number) => number;
  longevity: string;
  description: string;
}

export const PRODUCTS: Record<ProductType, ProductDef> = {
  semi: {
    id: "semi",
    label: "Semi-permanent",
    short: "semi",
    lift: () => 0,
    coverage: 0.55,
    depositOnly: 0.35,
    formulaNeutralization: 0,
    grayCoverage: () => 0.3,
    longevity: "about 4–8 washes",
    description: "No developer. Adds tone or goes darker; cannot lighten.",
  },
  demi: {
    id: "demi",
    label: "Demi-permanent / toner",
    short: "demi",
    lift: () => 0,
    coverage: 0.8,
    depositOnly: 0.6,
    formulaNeutralization: 0.05,
    grayCoverage: () => 0.55,
    longevity: "about 20–28 washes",
    description: "Low-volume developer. Tones, glosses and blends gray; does not lighten.",
  },
  permanent: {
    id: "permanent",
    label: "Permanent",
    short: "permanent",
    lift: (start) => (start <= 3 ? 2 : start <= 5 ? 2.5 : 3),
    coverage: 0.92,
    depositOnly: 0.7,
    formulaNeutralization: 0.15,
    grayCoverage: (target) => (target <= 7 ? 0.95 : target <= 8 ? 0.8 : 0.6),
    longevity: "permanent (grows out)",
    description: "Lifts about 2–3 levels on natural hair and deposits color. Most box dyes.",
  },
  "high-lift": {
    id: "high-lift",
    label: "High-lift blonde",
    short: "high-lift",
    lift: (start) => (start <= 3 ? 2.5 : start <= 4 ? 3 : 4),
    coverage: 0.6,
    depositOnly: 0.5,
    formulaNeutralization: 0.2,
    grayCoverage: () => 0.25,
    longevity: "permanent (grows out)",
    description: "Lifts up to ~4 levels on natural level 5+ hair. Poor on gray and on dark hair.",
  },
};

export const PRODUCT_TYPES: ProductType[] = ["semi", "demi", "permanent", "high-lift"];
