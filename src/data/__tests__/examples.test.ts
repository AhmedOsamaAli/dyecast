import { describe, expect, it } from "vitest";
import { EXAMPLES } from "@/data/examples";
import { GOAL_COLORS } from "@/data/goals";
import { deltaE2000, hexToLab, mixLab } from "@/lib/color";
import { decodeShade } from "@/lib/engine/shade-code";
import { predict } from "@/lib/engine/predict";
import { resultSwatch, todaySwatch } from "@/lib/engine/swatch";
import type { HairProfileInput } from "@/lib/engine/types";

const byId = Object.fromEntries(EXAMPLES.map((ex) => [ex.id, ex]));
const hair = (level: number, extra: Partial<HairProfileInput> = {}): HairProfileInput => ({
  lengthsLevel: level,
  naturalLevel: level,
  history: "virgin",
  gray: "none",
  ends: "healthy",
  levelConfirmed: true,
  ...extra,
});

describe("worked examples teach what their lessons say", () => {
  it("dark hair with an ash blonde box stalls warm and very different", () => {
    const p = byId["brunette-to-ash-blonde"].prediction;
    expect(p.verdict).toBe("very-different");
    expect(p.flags).toEqual(expect.arrayContaining(["stalled", "brassy"]));
  });

  it("box over box: old dye stays dark while roots lift", () => {
    const p = byId["box-over-box"].prediction;
    expect(p.verdict).toBe("very-different");
    expect(p.twoZone).toBe(true);
    expect(byId["box-over-box"].today.roots).toBeDefined();
  });

  it("mostly gray hair with a light shade blends: close overall, grays drawn brighter", () => {
    const ex = byId["gray-light-shade"];
    expect(ex.prediction.flags).toContain("gray-blend");
    expect(ex.prediction.streaks).toMatchObject({ kind: "gray", share: 0.8 });
    expect(hexToLab(ex.prediction.streaks!.hex).L).toBeGreaterThan(hexToLab(ex.prediction.streaks!.baseHex).L);
    expect(ex.today.streaks?.kind).toBe("gray");
  });

  it("brown straight over bleached hair turns murky and noticeably different", () => {
    const p = byId["bleached-to-brown"].prediction;
    expect(p.flags).toContain("muddy");
    expect(p.verdict).not.toBe("close");
    expect(p.lengths.lab.a).toBeLessThan(p.promise.lab.a);
  });

  it("a same-level refresh lands close", () => {
    expect(byId["same-level-gloss"].prediction.verdict).toBe("close");
  });

  it("all-over color on highlights shows stripes, never 'close to the box'", () => {
    const ex = byId["highlights-all-over"];
    expect(ex.prediction.flags).toContain("patchy");
    expect(ex.prediction.verdict).not.toBe("close");
    expect(ex.prediction.streaks?.kind).toBe("highlights");
    expect(ex.today.streaks?.kind).toBe("highlights");
  });
});

describe("strand groups", () => {
  it("mix back to the predicted lengths color", () => {
    for (const ex of EXAMPLES) {
      const s = ex.prediction.streaks;
      if (!s) continue;
      const mixed = mixLab(hexToLab(s.baseHex), hexToLab(s.hex), s.share);
      expect(deltaE2000(mixed, ex.prediction.lengths.lab)).toBeLessThan(1.5);
    }
  });

  it("are absent when everything takes the dye evenly", () => {
    const p = predict(hair(6), decodeShade("6.0").interpretations[0]);
    expect(p.streaks).toBeUndefined();
    expect(resultSwatch(p)).toEqual({ lengths: p.lengths.hex, roots: undefined, streaks: undefined });
  });

  it("describe today's hair: gray on virgin hair, highlights, and roots on colored hair", () => {
    expect(todaySwatch(hair(5, { gray: "half" })).streaks).toMatchObject({ kind: "gray", share: 0.5 });
    expect(todaySwatch(hair(6, { naturalLevel: 4, history: "highlighted" })).streaks?.kind).toBe("highlights");
    const dyed = todaySwatch(hair(4, { naturalLevel: 6, history: "dyed" }));
    expect(dyed.roots).toBeDefined();
    expect(dyed.streaks).toBeUndefined();
  });
});

describe("goal colors", () => {
  it("are distinct and ordered from light blondes to soft black", () => {
    const hexes = new Set(GOAL_COLORS.map((g) => g.hex));
    expect(hexes.size).toBe(GOAL_COLORS.length);
    const platinum = hexToLab(GOAL_COLORS[0].hex);
    const black = hexToLab(GOAL_COLORS[GOAL_COLORS.length - 1].hex);
    expect(platinum.L).toBeGreaterThan(black.L + 50);
  });

  it("copper red is clearly redder than caramel brown", () => {
    const copper = hexToLab(GOAL_COLORS.find((g) => g.id === "copper")!.hex);
    const caramel = hexToLab(GOAL_COLORS.find((g) => g.id === "caramel")!.hex);
    expect(copper.a).toBeGreaterThan(caramel.a);
  });
});
