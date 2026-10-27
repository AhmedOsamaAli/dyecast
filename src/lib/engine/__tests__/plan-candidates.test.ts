import { describe, expect, it } from "vitest";
import { buildPlan } from "../plan";
import { predict } from "../predict";
import { safetyChecklist } from "../safety";
import { decodeShade, findShadeCandidates } from "../shade-code";
import type { HairProfileInput } from "../types";

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
const ids = (profile: HairProfileInput, code: string, boxes = 1, toner?: string) =>
  buildPlan(profile, predict(profile, shade(code)), { boxes, toner: toner ? shade(toner) : undefined }).steps.map((s) => s.id);

describe("findShadeCandidates", () => {
  it("finds the shade code in noisy box text and ignores quantities", () => {
    const text = "PERMANENT HAIR COLOUR\n100% GREY COVERAGE\n6.3\nLIGHT GOLDEN BROWN\n1.7 FL OZ 50 ml 3g";
    const found = findShadeCandidates(text);
    expect(found[0].shade.code).toBe("6.3");
    expect(found.some((c) => ["1.7", "5.0", "3G"].includes(c.shade.code))).toBe(false);
  });

  it("ignores quantities even when OCR misreads the unit", () => {
    for (const unit of ["floz", "fl. oz", "fI oz", "f1 oz", "FL 0Z", "m1"]) {
      const codes = findShadeCandidates(`6.3 LIGHT GOLDEN BROWN 1.7 ${unit}`).map((c) => c.shade.code);
      expect(codes, unit).toEqual(["6.3"]);
    }
  });

  it("reads letter codes and prefers codes near shade words", () => {
    expect(findShadeCandidates("Nice'n Easy 6G Light Golden Brown")[0].shade.code).toBe("6G");
    expect(findShadeCandidates("Batch 2024 · No. 7/1 ash")[0].shade.code).toBe("7/1");
  });

  it("returns nothing for text without codes", () => {
    expect(findShadeCandidates("Gloves, conditioner and instructions inside")).toEqual([]);
  });
});

describe("buildPlan", () => {
  it("always starts with safety and the allergy alert test", () => {
    const steps = ids(hair(6), "6.0");
    expect(steps).toEqual(expect.arrayContaining(["safety-check", "allergy-test", "timer", "rinse"]));
    expect(steps.indexOf("allergy-test")).toBeLessThan(steps.indexOf("timer"));
  });

  it("stops box plans that need a professional", () => {
    const plan = buildPlan(hair(3), predict(hair(3), shade("10.1")), { boxes: 1 });
    expect(plan.professional).toBe(true);
    expect(plan.steps[0]).toMatchObject({ phase: "decide", kind: "stop" });
    expect(ids(hair(5, { history: "henna" }), "6.0")).toContain("stop-henna");
    expect(ids(hair(9, { naturalLevel: 6, history: "bleached" }), "5.1")).toContain("stop-filler");
  });

  it("personalizes application: hot roots, root retouch, gray first", () => {
    expect(ids(hair(5), "7.0")).toContain("hot-roots");
    expect(ids(hair(5, { naturalLevel: 5, history: "dyed" }), "5.0")).toContain("retouch");
    expect(ids(hair(6, { gray: "most" }), "6.0")).toContain("gray-first");
  });

  it("always plans a strand test 48 hours ahead, with personal reasons when there are any", () => {
    const strand = (profile: HairProfileInput) =>
      buildPlan(profile, predict(profile, shade("6.0")), { boxes: 1 }).steps.find((s) => s.id === "strand-test");
    expect(strand(hair(6))).toMatchObject({ when: "48 hours before" });
    expect(strand(hair(6))?.detail).not.toContain("matters even more");
    expect(strand(hair(6, { gray: "most" }))?.detail).toContain("gray can be resistant");
  });

  it("covers reactions on the day and color removers for lighter-over-dyed goals", () => {
    expect(ids(hair(6), "6.0")).toContain("reaction");
    expect(ids(hair(4, { naturalLevel: 6, history: "dyed" }), "7.0")).toContain("tip-remover");
    expect(ids(hair(5, { naturalLevel: 5, history: "dyed" }), "5.0")).not.toContain("tip-remover");
    const plan = buildPlan(hair(6), predict(hair(6), shade("6.0")), { boxes: 1 });
    expect(plan.professional).toBe(false);
  });

  it("adds toner, brass care and multiple boxes when relevant", () => {
    const steps = ids(hair(6), "8.1", 3, "8.1");
    expect(steps).toEqual(expect.arrayContaining(["toner", "buy"]));
    const plan = buildPlan(hair(4), predict(hair(4), shade("7.0")), { boxes: 3 });
    expect(plan.steps.find((s) => s.id === "buy")?.title).toContain("3 boxes");
    expect(plan.steps.some((s) => s.id === "brass-care")).toBe(true);
  });
});

describe("safetyChecklist", () => {
  it("always includes the allergy test, warning signs, strand test and the FDA 14-day wait", () => {
    const items = safetyChecklist(hair(6));
    const byId = Object.fromEntries(items.map((item) => [item.id, item]));
    expect(byId["patch-test"].level).toBe("must");
    expect(byId["warning-signs"].detail).toContain("72 hours");
    expect(byId["strand-test"].title).toContain("48 hours");
    expect(byId["chemical-wait"].title).toContain("14 days");
    expect(byId["henna"]).toBeUndefined();
  });

  it("adds henna and damaged-ends warnings only when they apply", () => {
    const found = safetyChecklist(hair(6, { history: "henna", ends: "damaged" })).map((item) => item.id);
    expect(found).toEqual(expect.arrayContaining(["henna", "damaged-ends"]));
  });
});
