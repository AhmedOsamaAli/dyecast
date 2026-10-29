import { describe, expect, it } from "vitest";
import { RETAIL_BOXES, type RetailBox } from "@/data/retail-boxes";
import { SHADE_CATALOG } from "@/data/shades";
import { boxesFor } from "../retail";

const box = (over: Partial<RetailBox>): RetailBox => ({
  brand: "B",
  line: "L",
  code: "6",
  name: "Light Brown",
  level: 6,
  primary: "natural",
  secondary: null,
  intense: false,
  product: "permanent",
  markets: ["US"],
  numbering: "us-letter",
  sourceUrl: "https://www.example.com/shade",
  ...over,
});

describe("boxes to buy", () => {
  it("lists only checked shades with a real source", () => {
    expect(RETAIL_BOXES.length).toBeGreaterThan(150);
    for (const b of RETAIL_BOXES) {
      expect(b.sourceUrl).toMatch(/^https:\/\/[^\s]+$/);
      expect(b.level).toBeGreaterThanOrEqual(1);
      expect(b.level).toBeLessThanOrEqual(10);
      expect(b.markets.length).toBeGreaterThan(0);
    }
  });

  it("matches level, tone and product, exact tones first and across brands", () => {
    const catalog = [
      box({ brand: "A", code: "6A", primary: "ash" }),
      box({ brand: "A", code: "6N" }),
      box({ brand: "A", code: "6" }),
      box({ brand: "B", code: "60" }),
      box({ brand: "D", code: "7N", level: 7 }),
      box({ brand: "E", code: "6", product: "demi" }),
      box({ brand: "F", code: "6.0", primary: "beige", numbering: "international" }),
    ];
    const got = boxesFor({ level: 6, tones: { primary: "natural" }, product: "permanent" }, 4, catalog);
    expect(got.map((b) => `${b.brand} ${b.code}`)).toEqual(["A 6", "B 60", "F 6.0", "A 6N"]);
    expect(got.map((b) => b.exact)).toEqual([true, true, false, true]);
    expect(got[0].source).toBe("example.com");
  });

  it("treats violet as a near-ash only on blondes (on browns it's plum)", () => {
    const catalog = [
      box({ code: "4-89", level: 4, primary: "violet", intense: true, numbering: "schwarzkopf" }),
      box({ brand: "Q", code: "9.2", level: 9, primary: "violet", numbering: "international" }),
    ];
    expect(boxesFor({ level: 4, tones: { primary: "ash" }, product: "permanent" }, 4, catalog)).toEqual([]);
    const blonde = boxesFor({ level: 9, tones: { primary: "ash" }, product: "permanent" }, 4, catalog);
    expect(blonde.map((b) => [b.code, b.exact])).toEqual([["9.2", false]]);
  });

  it("keeps high-lift blondes for high-lift steps", () => {
    const catalog = [box({ code: "11.0", level: 10, numbering: "international" }), box({ brand: "Z", code: "10", level: 10 })];
    const need = { level: 10, tones: { primary: "natural" as const } };
    expect(boxesFor({ ...need, product: "high-lift" }, 4, catalog).map((b) => b.code)).toEqual(["11.0"]);
    expect(boxesFor({ ...need, product: "permanent" }, 4, catalog).map((b) => b.code)).toEqual(["10"]);
  });

  it("finds real boxes for the everyday steps of a route", () => {
    for (const level of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const natural = boxesFor({ level, tones: { primary: "natural" }, product: "permanent" });
      expect(natural.length).toBeGreaterThan(1);
      expect(natural[0].exact).toBe(true);
      expect(new Set(natural.map((b) => b.brand)).size).toBeGreaterThan(1);
    }
    const colorSteps = SHADE_CATALOG.filter((s) => s.role === "color");
    const covered = colorSteps.filter((s) => boxesFor(s).length > 0).length;
    expect(covered / colorSteps.length).toBeGreaterThan(0.75);
  });
});
