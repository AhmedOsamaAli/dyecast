import { describe, expect, it } from "vitest";
import { decodeShade, formatCode, parseShadeName } from "../shade-code";

const first = (input: string) => decodeShade(input).interpretations[0];

describe("decodeShade — international dotted codes", () => {
  it("reads level and single tone", () => {
    const s = first("7.1");
    expect(s).toMatchObject({ level: 7, series: 7, code: "7.1", system: "international" });
    expect(s.tones).toEqual({ primary: "ash" });
    expect(s.name).toBe("Medium Ash Blonde");
  });

  it("reads two tones and comma decimals", () => {
    expect(first("7,13").tones).toEqual({ primary: "ash", secondary: "gold" });
  });

  it("treats a repeated digit as intense and a leading zero as a natural base", () => {
    expect(first("6.66").tones).toEqual({ primary: "red", intense: true });
    expect(first("7.01").tones).toEqual({ primary: "natural", secondary: "ash" });
  });

  it("reads codes inside longer product text", () => {
    expect(first("L'Oréal Excellence 6.3 Light Golden Brown").code).toBe("6.3");
  });
});

describe("decodeShade — other numbering systems", () => {
  it("reads slash codes with the Wella-style digit map and offers the international reading", () => {
    const r = decodeShade("6/2");
    expect(r.interpretations[0]).toMatchObject({ system: "wella", tones: { primary: "matte" } });
    expect(r.interpretations[1]).toMatchObject({ system: "international", tones: { primary: "violet" } });
  });

  it("reads dash codes with the Schwarzkopf-style digit map", () => {
    expect(first("9-1")).toMatchObject({ system: "schwarzkopf", tones: { primary: "blue" } });
  });

  it("reads US letter codes", () => {
    expect(first("6G")).toMatchObject({ level: 6, tones: { primary: "gold" }, system: "us-letter" });
    expect(first("5NN").tones).toEqual({ primary: "natural", intense: true });
    expect(first("Clairol 7NA").tones).toEqual({ primary: "natural", secondary: "ash" });
  });

  it("reads Garnier-style undotted numbers", () => {
    expect(first("63")).toMatchObject({ level: 6, tones: { primary: "gold" } });
    expect(first("Garnier Nutrisse 60")).toMatchObject({ level: 6, tones: { primary: "natural" } });
    expect(first("100")).toMatchObject({ level: 10, code: "10.0" });
    expect(first("101").tones).toEqual({ primary: "ash" });
  });

  it("maps 11/12 series to high-lift blonde", () => {
    const s = first("111");
    expect(s).toMatchObject({ level: 10, series: 11, suggestedProduct: "high-lift", code: "11.1" });
    expect(s.name).toBe("High-Lift Lightest Ash Blonde");
  });

  it("offers both readings for an ambiguous 10", () => {
    const r = decodeShade("10");
    expect(r.interpretations.map((s) => s.level)).toEqual([10, 1]);
  });
});

describe("decodeShade — names, hints and errors", () => {
  it("parses shade names when there is no code", () => {
    expect(first("light ash brown")).toMatchObject({ level: 5, tones: { primary: "ash" } });
    expect(first("Medium Golden Blonde")).toMatchObject({ level: 7, tones: { primary: "gold" } });
    expect(first("platinum")).toMatchObject({ level: 10, tones: { primary: "pearl" } });
    expect(parseShadeName("dark blonde")).toEqual({ level: 6, tones: { primary: "natural" } });
  });

  it("detects product type hints", () => {
    expect(decodeShade("9.1 toner").productHint).toBe("demi");
    expect(decodeShade("semi-permanent 5.6").productHint).toBe("semi");
    expect(decodeShade("high lift 12.11").productHint).toBe("high-lift");
  });

  it("notes when the name disagrees strongly with the number", () => {
    expect(first("9.1 dark brown").note).toMatch(/name suggests/i);
  });

  it("rejects empty and unreadable input", () => {
    expect(decodeShade("").ok).toBe(false);
    expect(decodeShade("hello").ok).toBe(false);
    expect(decodeShade("13.1").ok).toBe(false);
  });
});

describe("formatCode", () => {
  it("formats in each system", () => {
    expect(formatCode(7, { primary: "ash", secondary: "gold" })).toBe("7.13");
    expect(formatCode(6, { primary: "gold" }, "us-letter")).toBe("6G");
    expect(formatCode(9, { primary: "blue" }, "schwarzkopf")).toBe("9-1");
    expect(formatCode(5, { primary: "red", intense: true })).toBe("5.66");
  });
});
