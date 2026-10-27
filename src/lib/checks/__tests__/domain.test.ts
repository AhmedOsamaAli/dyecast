import { describe, expect, it } from "vitest";
import { buildReport, planFor } from "../report";
import { checkTargetSchema, DEFAULT_PROFILE, hairProfileSchema, studioSchema, type StudioInput } from "../validation";

const example: StudioInput = { ...DEFAULT_PROFILE, shadeCode: "9.1", system: "international", product: "permanent", source: "code" };

describe("hair profile validation", () => {
  it("accepts form strings and preserves all manually selected characteristics", () => {
    const result = studioSchema.parse({
      ...example,
      lengthsLevel: "6.5",
      naturalLevel: "4",
      history: "highlighted",
      texture: "coily",
      thickness: "fine",
      currentTone: "warm",
    });
    expect(result.lengthsLevel).toBe(6.5);
    expect(result).toMatchObject({ history: "highlighted", texture: "coily", thickness: "fine", currentTone: "warm" });
  });

  it.each([0, 11, "", "not a level", Infinity, 4.2])("rejects invalid level %s", (lengthsLevel) => {
    expect(hairProfileSchema.safeParse({ ...DEFAULT_PROFILE, lengthsLevel }).success).toBe(false);
  });

  it("requires matching roots and lengths for never-colored hair", () => {
    expect(hairProfileSchema.safeParse({ ...DEFAULT_PROFILE, naturalLevel: 5 }).success).toBe(false);
    expect(hairProfileSchema.safeParse({ ...DEFAULT_PROFILE, naturalTone: "warm" }).success).toBe(false);
  });

  it("rejects missing and invented characteristics", () => {
    expect(hairProfileSchema.safeParse({ ...DEFAULT_PROFILE, history: "unknown" }).success).toBe(false);
    expect(hairProfileSchema.safeParse({ ...DEFAULT_PROFILE, density: undefined }).success).toBe(false);
  });

  it("parses the photo measurement as suggestions and rejects malformed JSON", () => {
    const measurement = { measuredHex: "#4a3222", youcamHairClass: "Brown", lengthTerm: "long hair", mock: true, analyzedAt: "2026-10-27T10:00:00Z" };
    const ok = hairProfileSchema.parse({ ...DEFAULT_PROFILE, measurement: JSON.stringify(measurement) });
    expect(ok.measurement).toEqual(measurement);
    expect(hairProfileSchema.parse({ ...DEFAULT_PROFILE, measurement: "" }).measurement).toBeUndefined();
    expect(hairProfileSchema.safeParse({ ...DEFAULT_PROFILE, measurement: "{oops" }).success).toBe(false);
    expect(hairProfileSchema.safeParse({ ...DEFAULT_PROFILE, measurement: JSON.stringify({ ...measurement, measuredHex: "red" }) }).success).toBe(false);
  });
});

describe("check targets", () => {
  it("accepts every source and normalizes empty optional fields", () => {
    const goal = checkTargetSchema.parse({
      shadeCode: "8.1", system: "international", product: "permanent", source: "goal",
      goalHex: "#c9b08a", goalName: "Beige blonde", tonerCode: "9.1", productUrl: "", productTitle: "",
    });
    expect(goal).toMatchObject({ source: "goal", goalHex: "#c9b08a", tonerCode: "9.1" });
    expect(goal.productUrl).toBeUndefined();
    expect(checkTargetSchema.parse({ shadeCode: "6G", system: "us-letter", product: "permanent" }).source).toBe("code");
  });

  it("rejects unsafe or malformed links and colors", () => {
    const base = { shadeCode: "7.1", system: "international", product: "permanent", source: "link" };
    expect(checkTargetSchema.safeParse({ ...base, productUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(checkTargetSchema.safeParse({ ...base, productUrl: "https://shop.example.com/p/7-1" }).success).toBe(true);
    expect(checkTargetSchema.safeParse({ ...base, goalHex: "#zzz" }).success).toBe(false);
  });
});

describe("reports", () => {
  it("builds a finite, explainable forecast with safety, routes and a plan", () => {
    const result = buildReport(example);
    if (!result.ok) throw new Error(result.error);
    expect(result.report.prediction.lengths.level).toBeLessThan(9);
    expect(result.report.prediction.reasons.length).toBeGreaterThan(0);
    expect(result.report.safety.some((item) => item.id === "patch-test")).toBe(true);
    expect(result.report.paths?.options.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(result.report))).toEqual(result.report);
    const plan = planFor(example, result.report);
    expect(plan.professional).toBe(true);
    expect(plan.steps.some((s) => s.id === "allergy-test")).toBe(true);
  });

  it("aims routes at the goal color when one was chosen", () => {
    const toGoal = buildReport({ ...example, shadeCode: "7.0", source: "goal", goalHex: "#3b2a20" });
    const toBox = buildReport({ ...example, shadeCode: "7.0" });
    if (!toGoal.ok || !toBox.ok) throw new Error("expected reports");
    expect(toGoal.report.paths?.goalHex).toBe("#3b2a20");
    expect(toGoal.report.paths?.goalHex).not.toBe(toBox.report.paths?.goalHex);
  });

  it("adds the toner step from a goal route to the plan", () => {
    const input: StudioInput = { ...example, lengthsLevel: 6, naturalLevel: 6, shadeCode: "8.0", source: "goal", tonerCode: "8.1" };
    const result = buildReport(input);
    if (!result.ok) throw new Error(result.error);
    expect(planFor(input, result.report).steps.some((s) => s.id === "toner")).toBe(true);
  });

  it("rejects unreadable and inconsistent high-lift codes instead of inventing a prediction", () => {
    expect(buildReport({ ...example, shadeCode: "unicorn" }).ok).toBe(false);
    expect(buildReport({ ...example, shadeCode: "11.1" }).ok).toBe(false);
    expect(buildReport({ ...example, shadeCode: "11.1", product: "high-lift" }).ok).toBe(true);
  });

  it.each([{ history: "henna" as const }, { ends: "damaged" as const }])("withholds box recommendations for %o", (overrides) => {
    const result = buildReport({ ...example, ...overrides });
    if (!result.ok) throw new Error(result.error);
    expect(result.report.needsConsultation).toBe(true);
    expect(result.report.paths).toBeNull();
  });

  it("never promises dye can lift previously dyed lengths", () => {
    const result = buildReport({ ...example, history: "dyed" });
    if (!result.ok) throw new Error(result.error);
    expect(result.report.prediction.lengths.lift).toBe(0);
    expect(result.report.prediction.twoZone).toBe(true);
  });
});
