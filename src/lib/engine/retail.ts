import { RETAIL_BOXES, type RetailBox } from "@/data/retail-boxes";
import type { ProductType, ShadeTones, ToneId } from "./types";

/** Tones that read alike on a box: when the exact tone isn't sold at a level, the same family is a close match. */
const FAMILY: Record<ToneId, string> = {
  natural: "natural",
  beige: "natural",
  mocha: "natural",
  warm: "gold",
  gold: "gold",
  ash: "cool",
  pearl: "cool",
  matte: "cool",
  blue: "cool",
  violet: "cool",
  copper: "copper",
  red: "red",
  mahogany: "red",
};

/** The part of a route step a box has to match. */
export interface BoxNeed {
  level: number;
  tones: ShadeTones;
  product: ProductType;
}

/** A real box for a route step, small enough to send to the browser. */
export interface BoxMatch {
  brand: string;
  line: string;
  code: string;
  name: string;
  markets: string[];
  sourceUrl: string;
  /** Where it was checked, e.g. "clairol.com". */
  source: string;
  /** Same level and main tone; otherwise same level and tone family. */
  exact: boolean;
}

/** Codes printed as 11.x / 12-x / 12/x are high-lift blondes, whatever the product type says. */
function isHighLift(box: RetailBox): boolean {
  const series = /^(\d{1,2})[./-]/.exec(box.code);
  return box.numbering !== "us-letter" && series !== null && Number(series[1]) >= 11;
}

function sameProduct(box: RetailBox, product: ProductType): boolean {
  if (product === "high-lift") return isHighLift(box);
  return box.product === product && !isHighLift(box);
}

function tier(box: RetailBox, tones: ShadeTones, level: number): number {
  if (box.primary === tones.primary) return (box.secondary ?? undefined) === tones.secondary ? 0 : 1;
  return familyOf(box.primary, level) === familyOf(tones.primary, level) ? 2 : 9;
}

/** Violet is a near-ash only on blondes (iridescent); on browns it's plum or aubergine, a color of its own. */
function familyOf(tone: ToneId, level: number): string {
  return tone === "violet" && level < 7 ? "violet" : FAMILY[tone];
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * Real, checked boxes for one route step: same level and product type, the exact tone first, then the same tone
 * family, one per product line before repeats so the list spans brands. Empty when nothing on the shelf fits.
 */
export function boxesFor(need: BoxNeed, limit = 4, catalog: RetailBox[] = RETAIL_BOXES): BoxMatch[] {
  const ranked = catalog
    .filter((box) => Math.round(box.level) === Math.round(need.level) && sameProduct(box, need.product))
    .map((box) => ({ box, tier: tier(box, need.tones, need.level) + (box.intense !== Boolean(need.tones.intense) ? 0.5 : 0) }))
    .filter((r) => r.tier < 9)
    .sort((a, b) => a.tier - b.tier || a.box.brand.localeCompare(b.box.brand) || a.box.code.localeCompare(b.box.code));
  // Exact tones first, spread across brands, then across product lines; then close tones the same way; then repeats.
  const picked: typeof ranked = [];
  const used = new Set<string>();
  const brand = (box: RetailBox) => box.brand;
  const line = (box: RetailBox) => `${box.brand}|${box.line}`;
  const passes: Array<[(tier: number) => boolean, (box: RetailBox) => string]> = [
    [(t) => t < 2, brand],
    [(t) => t < 2, line],
    [() => true, brand],
    [() => true, line],
  ];
  for (const [fits, keyOf] of passes) {
    for (const r of ranked) {
      if (!fits(r.tier) || picked.includes(r) || used.has(keyOf(r.box))) continue;
      used.add(brand(r.box));
      used.add(line(r.box));
      picked.push(r);
    }
  }
  for (const r of ranked) if (!picked.includes(r)) picked.push(r);
  return picked.slice(0, limit).map(({ box, tier: t }) => ({
    brand: box.brand,
    line: box.line,
    code: box.code,
    name: box.name,
    markets: box.markets,
    sourceUrl: box.sourceUrl,
    source: hostOf(box.sourceUrl),
    exact: t < 2,
  }));
}
