import { describe, expect, it } from "vitest";
import { EXAMPLES } from "@/data/examples";
import { describeChange, gapMeaning } from "../explain";
import { predict } from "../predict";
import { decodeShade } from "../shade-code";
import type { HairProfileInput } from "../types";

const byId = Object.fromEntries(EXAMPLES.map((ex) => [ex.id, ex.prediction]));
const change = (id: string) => Object.fromEntries(describeChange(byId[id]).map((c) => [c.id, c]));
const hair = (level: number, extra: Partial<HairProfileInput> = {}): HairProfileInput => ({
  lengthsLevel: level,
  naturalLevel: level,
  history: "virgin",
  gray: "none",
  ends: "healthy",
  levelConfirmed: true,
  ...extra,
});

describe("gapMeaning", () => {
  it("translates the color gap into plain words", () => {
    expect(gapMeaning(3).zone).toBe("close");
    expect(gapMeaning(8).zone).toBe("different");
    expect(gapMeaning(30)).toEqual({ zone: "very-different", text: "Anyone would see the difference" });
  });
});

describe("describeChange", () => {
  it("always explains depth, tone and evenness", () => {
    for (const ex of EXAMPLES) expect(describeChange(ex.prediction).map((c) => c.id)).toEqual(["depth", "tone", "evenness"]);
  });

  it("dark hair with an ash blonde box: much darker and brassy", () => {
    const c = change("brunette-to-ash-blonde");
    expect(c.depth.title).toMatch(/levels darker than the box/);
    expect(c.depth.tone).toBe("bad");
    expect(c.tone.title).toMatch(/warmer/i);
  });

  it("a same-level refresh matches the box", () => {
    const c = change("same-level-gloss");
    expect(c.depth.title).toBe("Same depth as the box");
    expect(c.tone.tone).toBe("good");
  });

  it("names two-zone results, stripes, grays and murky tones", () => {
    expect(change("box-over-box").evenness.title).toMatch(/Roots|lengths/);
    expect(change("highlights-all-over").evenness.title).toBe("Highlights stay as stripes");
    expect(change("gray-light-shade").evenness.title).toBe("Grays stay brighter");
    expect(change("bleached-to-brown").tone.title).toBe("Flat or greenish");
  });

  it("uses singular and plural levels correctly", () => {
    const p = predict(hair(6), decodeShade("8.0").interpretations[0]);
    const depth = describeChange(p)[0];
    expect(depth.title).not.toMatch(/\b1 levels\b/);
  });
});
