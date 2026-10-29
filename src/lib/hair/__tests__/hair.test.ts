import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deltaE2000, hexToLab, labToLch, rgbToLab } from "@/lib/color";
import { CHIP_TEXTURE, cropAlign, fadeAt, HAIR_TEXTURE, isMirrored, rootsFade, streakMask, swatchLayers } from "../texture";
import { RAMP_STOPS, rampLab, rampLut, rampStops, rampTables } from "../ramp";

const SHADES = ["#1f1814", "#4e3c30", "#785e48", "#a96b3b", "#ae8e61", "#d7c6b8"];

describe("rampLab", () => {
  it("maps the texture's average gray to exactly the target color", () => {
    for (const hex of SHADES) {
      const target = hexToLab(hex);
      expect(deltaE2000(rampLab(target, 0.5), target)).toBeLessThan(0.01);
    }
  });

  it("gets lighter from shadow to shine without changing hue", () => {
    for (const hex of SHADES) {
      const target = hexToLab(hex);
      const steps = Array.from({ length: 21 }, (_, i) => labToLch(rampLab(target, i / 20)));
      for (let i = 1; i < steps.length; i++) expect(steps[i].L).toBeGreaterThan(steps[i - 1].L);
      for (const s of steps) if (s.C > 1) expect(Math.abs(s.h - labToLch(target).h)).toBeLessThan(0.01);
    }
  });

  it("makes the shine paler and less saturated than the hair, like real highlights", () => {
    const target = hexToLab("#a96b3b");
    const shine = labToLch(rampLab(target, 1));
    expect(shine.L).toBeGreaterThan(target.L + 20);
    expect(shine.C).toBeLessThan(labToLch(target).C * 0.5);
  });
});

describe("gradient map tables", () => {
  it("has one evenly spaced stop per table entry, in 0–1, with the target in the middle", () => {
    const tables = rampTables("#785e48");
    for (const channel of [tables.r, tables.g, tables.b]) {
      const values = channel.split(" ").map(Number);
      expect(values).toHaveLength(RAMP_STOPS);
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    const middle = rampStops("#785e48")[(RAMP_STOPS - 1) / 2];
    expect(deltaE2000(rgbToLab(middle), hexToLab("#785e48"))).toBeLessThan(0.5);
  });

  it("the canvas lookup table matches the SVG table at every stop", () => {
    const stops = rampStops("#ae8e61");
    const lut = rampLut("#ae8e61");
    expect(lut).toHaveLength(256 * 3);
    for (let i = 0; i < RAMP_STOPS; i++) {
      const v = Math.round((i / (RAMP_STOPS - 1)) * 255);
      expect(Math.abs(lut[v * 3] - stops[i].r)).toBeLessThanOrEqual(2);
      expect(Math.abs(lut[v * 3 + 2] - stops[i].b)).toBeLessThanOrEqual(2);
    }
  });
});

describe("swatch layers", () => {
  it("draws a single-color swatch as one layer", () => {
    expect(swatchLayers({ lengths: "#785e48" })).toEqual([{ hex: "#785e48" }]);
  });

  it("fades roots into the lengths at the roots' share of the height", () => {
    const [, roots] = swatchLayers({ lengths: "#4e3326", roots: "#82492c", rootsShare: 0.22 });
    expect(roots.hex).toBe("#82492c");
    expect(roots.roots).toEqual(rootsFade(0.22));
    expect(fadeAt(roots.roots!, 40)).toBe(1);
    expect(fadeAt(roots.roots!, 200)).toBe(0);
    expect(rootsFade(0.4).from).toBeGreaterThan(rootsFade(0.22).from);
  });

  it("keeps highlights below new roots, while gray strands run from the roots", () => {
    const highlights = swatchLayers({ lengths: "#624c3b", roots: "#3b2d24", streaks: { kind: "highlights", hex: "#af8d67", share: 0.35 } });
    expect(highlights[2].strands).toMatch(/mask-highlights/);
    expect(highlights[2].belowRoots).toEqual(highlights[1].roots);
    const gray = swatchLayers({ lengths: "#785e48", roots: "#5b4a3d", streaks: { kind: "gray", hex: "#d2cbc1", share: 0.24 } });
    expect(gray[2].belowRoots).toBeUndefined();
  });

  it("skips streaks with no visible share", () => {
    expect(swatchLayers({ lengths: "#785e48", streaks: { kind: "gray", hex: "#d2cbc1", share: 0 } })).toHaveLength(1);
  });

  it("picks the gray mask closest to the share of gray strands", () => {
    const mask = (share: number) => streakMask({ kind: "gray", share });
    expect(mask(0.06)).toMatch(/mask-gray15-/);
    expect(mask(0.15)).toMatch(/mask-gray15-/);
    expect(mask(0.2)).toMatch(/mask-gray25-/);
    expect(mask(0.24)).toMatch(/mask-gray25-/);
    expect(mask(0.5)).toMatch(/mask-gray50-/);
    expect(mask(0.8)).toMatch(/mask-gray75-/);
  });

  it("mirrors odd seeds only", () => {
    expect(isMirrored(4)).toBe(false);
    expect(isMirrored(5)).toBe(true);
    expect(isMirrored(-3)).toBe(true);
  });

  it("varies the visible part of the photo by seed, but keeps roots in view", () => {
    const aligns = new Set(Array.from({ length: 6 }, (_, seed) => cropAlign({ seed })));
    expect([...aligns].sort()).toEqual([0, 0.5, 1]);
    for (let seed = 0; seed < 6; seed++) expect(cropAlign({ seed, roots: "#82492c" })).toBe(0);
  });

  it("every texture it can ask for is in public/ (regenerate with scripts/hair-photo.mjs)", () => {
    const masks = [0.15, 0.25, 0.5, 0.75].map((share) => streakMask({ kind: "gray", share }));
    for (const src of [HAIR_TEXTURE, CHIP_TEXTURE, streakMask({ kind: "highlights", share: 0.35 }), ...masks]) {
      expect(existsSync(join(process.cwd(), "public", src)), src).toBe(true);
    }
  });
});
