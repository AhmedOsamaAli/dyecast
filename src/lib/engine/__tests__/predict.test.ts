import { describe, expect, it } from "vitest";
import { decodeShade } from "../shade-code";
import { predict, shadeIdealLab } from "../predict";
import type { HairProfileInput } from "../types";

/**
 * Validation suite: each case encodes a rule colorists teach and box-dye charts show,
 * asserted directionally so the model can be tuned without rewriting the rules.
 */
const shade = (code: string) => decodeShade(code).interpretations[0];
const hair = (level: number, extra: Partial<HairProfileInput> = {}): HairProfileInput => ({
  lengthsLevel: level,
  naturalLevel: level,
  history: "virgin",
  gray: "none",
  ends: "healthy",
  levelConfirmed: true,
  ...extra,
});

describe("R2 — going darker deposits well", () => {
  it("level 7 natural hair with 5.0 lands close to the box", () => {
    const p = predict(hair(7), shade("5.0"));
    expect(p.verdict).toBe("close");
    expect(p.lengths.level).toBe(5);
    expect(p.flags).not.toContain("brassy");
    expect(p.reasons.map((r) => r.rule)).toContain("R2");
  });
});

describe("R3/R4/R5 — lifting limits and exposed warmth", () => {
  it("a 2-level lift within range stays reasonably close", () => {
    const p = predict(hair(6), shade("8.1"));
    expect(p.lengths.level).toBeCloseTo(8, 5);
    expect(p.flags).not.toContain("stalled");
    expect(p.verdict).not.toBe("very-different");
  });

  it("dark level 4 hair with a 9.1 box stalls warm, darker and very different", () => {
    const p = predict(hair(4), shade("9.1"));
    expect(p.lengths.level).toBeLessThan(7);
    expect(p.flags).toEqual(expect.arrayContaining(["stalled", "brassy", "darker", "needs-bleach"]));
    expect(p.verdict).toBe("very-different");
    expect(p.reasons.map((r) => r.rule)).toEqual(expect.arrayContaining(["R3", "R4", "R5"]));
  });

  it("high-lift reaches lighter than permanent from the same start", () => {
    const permanent = predict(hair(6), shade("10.0"), "permanent");
    const highLift = predict(hair(6), shade("11.0"), "high-lift");
    expect(highLift.lengths.lab.L).toBeGreaterThan(permanent.lengths.lab.L);
    expect(highLift.lengths.level).toBeGreaterThanOrEqual(9.5);
  });

  it("high-lift on dark hair still stalls warm", () => {
    const p = predict(hair(3), shade("11.1"), "high-lift");
    expect(p.flags).toEqual(expect.arrayContaining(["stalled", "brassy"]));
  });

  it("ash cancels more warmth than gold at the same level", () => {
    const ash = predict(hair(6), shade("8.1"));
    const gold = predict(hair(6), shade("8.3"));
    expect(ash.lengths.lab.b).toBeLessThan(gold.lengths.lab.b);
  });
});

describe("R1 / R6 — deposit-only products and 'color can't lift color'", () => {
  it("demi-permanent cannot lighten", () => {
    const p = predict(hair(5), shade("8.0"), "demi");
    expect(p.lengths.level).toBe(5);
    expect(p.flags).toContain("no-change");
    expect(p.reasons.map((r) => r.rule)).toContain("R1");
  });

  it("dyed lengths stay put while natural roots lift — hot roots", () => {
    const p = predict(hair(4, { naturalLevel: 6, history: "dyed" }), shade("7.0"));
    expect(p.lengths.level).toBe(4);
    expect(p.roots.level).toBeGreaterThan(6.5);
    expect(p.twoZone).toBe(true);
    expect(p.flags).toEqual(expect.arrayContaining(["hot-roots", "needs-bleach"]));
    expect(p.reasons.map((r) => r.rule)).toContain("R6");
  });
});

describe("R7 — scalp heat on virgin hair", () => {
  it("roots come out at least as light as lengths when lifting", () => {
    const p = predict(hair(5), shade("7.0"));
    expect(p.roots.lab.L).toBeGreaterThanOrEqual(p.lengths.lab.L);
  });
});

describe("R8 — gray", () => {
  it("mostly gray hair under a light permanent shade blends rather than covers", () => {
    expect(predict(hair(6, { gray: "most" }), shade("9.0")).flags).toContain("gray-blend");
  });

  it("half gray with a medium natural shade is covered", () => {
    expect(predict(hair(5, { gray: "half" }), shade("5.0")).flags).not.toContain("gray-blend");
  });
});

describe("R9 / R10 / R11 / R12 / R13 — hair condition and history", () => {
  it("damaged ends take deposit darker than healthy ends", () => {
    const healthy = predict(hair(6, { history: "dyed", naturalLevel: 6 }), shade("5.0"));
    const damaged = predict(hair(6, { history: "dyed", naturalLevel: 6, ends: "damaged" }), shade("5.0"));
    expect(damaged.lengths.lab.L).toBeLessThan(healthy.lengths.lab.L);
    expect(damaged.flags).toContain("uneven-ends");
  });

  it("a big jump darker on bleached hair turns murky", () => {
    const p = predict(hair(9, { naturalLevel: 6, history: "bleached" }), shade("5.1"));
    expect(p.flags).toContain("muddy");
    expect(p.reasons.map((r) => r.rule)).toContain("R10");
  });

  it("fine hair lifts further than coarse hair", () => {
    const fine = predict(hair(5, { thickness: "fine" }), shade("9.0"));
    const coarse = predict(hair(5, { thickness: "coarse" }), shade("9.0"));
    expect(fine.lengths.level).toBeGreaterThan(coarse.lengths.level);
  });

  it("highlighted hair lifting to a lighter shade comes out patchy", () => {
    const p = predict(hair(6, { naturalLevel: 4, history: "highlighted" }), shade("8.0"));
    expect(p.flags).toContain("patchy");
  });

  it("henna is flagged with low confidence", () => {
    const p = predict(hair(5, { history: "henna" }), shade("6.0"));
    expect(p.flags).toContain("henna-risk");
    expect(p.confidenceLabel).toBe("low");
  });
});

describe("general properties", () => {
  it("the box promise does not depend on the person", () => {
    expect(predict(hair(3), shade("7.1")).promise.hex).toBe(predict(hair(8), shade("7.1")).promise.hex);
  });

  it("unconfirmed levels lower confidence", () => {
    const sure = predict(hair(6), shade("7.0"));
    const unsure = predict(hair(6, { levelConfirmed: false }), shade("7.0"));
    expect(unsure.confidence).toBeLessThan(sure.confidence);
  });

  it("selected tone changes the starting color when no photo was measured", () => {
    const neutral = predict(hair(6, { currentTone: "neutral" }), shade("6.0"));
    const red = predict(hair(6, { currentTone: "red" }), shade("6.0"));
    expect(red.lengths.lab.a).toBeGreaterThan(neutral.lengths.lab.a);
  });

  it("always explains itself", () => {
    for (const code of ["5.0", "8.1", "9.1", "6.66", "11.1"]) {
      expect(predict(hair(5), shade(code)).reasons.length).toBeGreaterThan(0);
    }
  });

  it("ideal ash blonde is cooler than ideal golden blonde", () => {
    expect(shadeIdealLab(9, { primary: "ash" }).b).toBeLessThan(shadeIdealLab(9, { primary: "gold" }).b);
  });
});
