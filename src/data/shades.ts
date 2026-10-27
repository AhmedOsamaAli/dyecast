import { formatCode, shadeName } from "@/lib/engine/shade-code";
import type { DecodedShade, ProductType, ShadeRole, ShadeTones } from "@/lib/engine/types";

/**
 * Universal shade catalog using international numbering. These are generic shades, not brand SKUs:
 * the user's own box code is always decoded directly, and this list powers search and "get there".
 */
export interface CatalogShade extends DecodedShade {
  id: string;
  product: ProductType;
  role: ShadeRole;
}

function entry(series: number, tones: ShadeTones, product: ProductType = "permanent", role: ShadeRole = "color"): CatalogShade {
  const level = Math.min(series, 10);
  const code = formatCode(series, tones, "international");
  return {
    id: `${product}-${code}`,
    code,
    level,
    series,
    tones,
    system: "international",
    name: shadeName(level, tones, series),
    suggestedProduct: series > 10 ? "high-lift" : undefined,
    product,
    role,
  };
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const SHADE_CATALOG: CatalogShade[] = [
  ...range(1, 10).map((l) => entry(l, { primary: "natural" })),
  ...range(4, 10).map((l) => entry(l, { primary: "ash" })),
  ...range(5, 10).map((l) => entry(l, { primary: "gold" })),
  ...range(7, 9).map((l) => entry(l, { primary: "ash", secondary: "gold" })),
  ...range(4, 8).map((l) => entry(l, { primary: "copper" })),
  ...range(5, 8).map((l) => entry(l, { primary: "copper", secondary: "gold" })),
  ...range(3, 6).map((l) => entry(l, { primary: "mahogany" })),
  ...range(4, 7).map((l) => entry(l, { primary: "red" })),
  ...range(8, 10).map((l) => entry(l, { primary: "violet" })),
  ...range(9, 10).map((l) => entry(l, { primary: "pearl" })),
  entry(11, { primary: "natural" }, "high-lift"),
  entry(11, { primary: "ash" }, "high-lift"),
  entry(11, { primary: "violet" }, "high-lift"),
  ...range(7, 10).map((l) => entry(l, { primary: "ash" }, "demi", "toner")),
  ...range(8, 10).map((l) => entry(l, { primary: "violet" }, "demi", "toner")),
  ...range(9, 10).map((l) => entry(l, { primary: "pearl" }, "demi", "toner")),
];

export function findCatalogShade(id: string): CatalogShade | undefined {
  return SHADE_CATALOG.find((s) => s.id === id);
}
