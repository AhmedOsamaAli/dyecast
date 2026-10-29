import { describe, expect, it } from "vitest";
import { GOAL_COLORS } from "@/data/goals";
import { goalTemperature, rankGoals, reachGoals, undertoneFromSkin, type ChoosePrefs } from "../recommend";
import type { HairProfileInput } from "../types";

const hair = (level: number, extra: Partial<HairProfileInput> = {}): HairProfileInput => ({
  lengthsLevel: level,
  naturalLevel: level,
  history: "virgin",
  gray: "none",
  ends: "healthy",
  levelConfirmed: true,
  ...extra,
});

const lightBrown = hair(6);
const lightBrownReach = reachGoals(lightBrown);
const darkReach = reachGoals(hair(3));
const pick = (prefs: ChoosePrefs, reach = lightBrownReach, profile = lightBrown) => rankGoals(reach, profile, prefs);
const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;

describe("reachGoals", () => {
  it("works out every goal on this hair: a box route, or why it takes a colorist", () => {
    expect(lightBrownReach).toHaveLength(GOAL_COLORS.length);
    for (const r of [...lightBrownReach, ...darkReach]) {
      expect(r.likelyHex).toMatch(/^#[0-9a-f]{6}$/);
      if (r.route === "colorist") {
        expect(r.steps).toEqual([]);
        expect(r.distance).toBeNull();
        expect(r.colorist).toBeTruthy();
      } else {
        expect(r.steps[0].role).toBe("color");
        expect(r.steps).toHaveLength(r.route === "one-box" ? 1 : 2);
      }
    }
  });

  it("sends a big lift from dark hair to a colorist", () => {
    const platinum = darkReach.find((r) => r.goal.id === "platinum")!;
    expect(platinum.route).toBe("colorist");
    expect(platinum.regrowth).toBeGreaterThan(5);
  });
});

describe("rankGoals", () => {
  it("warm skin, a subtle change and low upkeep: reachable warm or neutral shades near today's color", () => {
    const top = pick({ boldness: "subtle", upkeep: "low", undertone: "warm" }).slice(0, 3);
    for (const p of top) {
      expect(p.route).not.toBe("colorist");
      expect(goalTemperature(p.goal.tones)).not.toBe("cool");
      expect(p.reasons.length).toBeGreaterThan(0);
    }
    expect(top.some((p) => p.reasons.includes("Flatters warm undertones"))).toBe(true);
  });

  it("cool skin keeps warm shades out of the top picks", () => {
    const top = pick({ boldness: "noticeable", upkeep: "medium", undertone: "cool" }).slice(0, 3);
    for (const p of top) expect(goalTemperature(p.goal.tones)).not.toBe("warm");
  });

  it("a bold change brings bigger changes to the top than a subtle one", () => {
    const avgChange = (boldness: ChoosePrefs["boldness"]) =>
      mean(pick({ boldness, upkeep: "high", undertone: "neutral" }).slice(0, 3).map((p) => p.change));
    expect(avgChange("bold")).toBeGreaterThan(avgChange("subtle") + 8);
  });

  it("low upkeep ranks fast-fading reds lower and says why", () => {
    const rank = (upkeep: ChoosePrefs["upkeep"]) => pick({ boldness: "noticeable", upkeep, undertone: "neutral" });
    const position = (upkeep: ChoosePrefs["upkeep"]) => rank(upkeep).findIndex((p) => p.goal.id === "copper");
    expect(position("low")).toBeGreaterThan(position("high"));
    expect(rank("low").find((p) => p.goal.id === "copper")!.cautions.join(" ")).toMatch(/Reds fade fast/);
  });

  it("explains a colorist route instead of hiding it", () => {
    const platinum = pick({ boldness: "bold", upkeep: "high", undertone: "neutral" }, darkReach, hair(3)).find((p) => p.goal.id === "platinum")!;
    expect(platinum.cautions[0]).toMatch(/lighter|box|colorist|Lightener/i);
  });
});

describe("undertones", () => {
  it("reads golden skin as warm, rosy skin as cool, and in-between as neutral", () => {
    expect(undertoneFromSkin("#d9a066")).toBe("warm");
    expect(undertoneFromSkin("#e8b4b8")).toBe("cool");
    expect(undertoneFromSkin("#c9a08f")).toBe("neutral");
  });

  it("gives every goal a temperature from its main tone", () => {
    const of = (id: string) => goalTemperature(GOAL_COLORS.find((g) => g.id === id)!.tones);
    expect([of("golden"), of("copper"), of("caramel")]).toEqual(["warm", "warm", "warm"]);
    expect([of("icy-ash"), of("platinum"), of("mahogany")]).toEqual(["cool", "cool", "cool"]);
    expect([of("chocolate"), of("espresso"), of("beige")]).toEqual(["neutral", "neutral", "neutral"]);
  });
});
