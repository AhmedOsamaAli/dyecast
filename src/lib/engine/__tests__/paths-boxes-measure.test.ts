import { describe, expect, it } from "vitest";
import { naturalLab } from "../levels";
import { hexToLab } from "@/lib/color";
import { boxesNeeded, densityFromYouCam, lengthFromYouCam } from "../boxes";
import { findPaths } from "../get-there";
import { CAMERA_L_OFFSET, classNote, readHair, robustHairLab, suggestFromHairClass, suggestFromLab } from "../measure";
import { decodeShade } from "../shade-code";
import { shadeIdealLab, describedHairLab } from "../predict";
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

const goalOf = (code: string) => {
  const s = decodeShade(code).interpretations[0];
  return shadeIdealLab(s.level, s.tones);
};

describe("findPaths", () => {
  it("finds a close one-box route when the goal is within reach", () => {
    const r = findPaths(hair(6), goalOf("8.1"));
    expect(r.professional).toBe(false);
    expect(r.options[0].distance).toBeLessThan(6);
    expect(r.options.length).toBeLessThanOrEqual(3);
    expect(new Set(r.options.map((o) => o.steps[0].shade.id)).size).toBe(r.options.length);
  });

  it("refers to a professional when the goal is beyond box lift", () => {
    const r = findPaths(hair(3), goalOf("10.1"));
    expect(r.professional).toBe(true);
    expect(r.professionalReason).toBeTruthy();
  });

  it("refers to a professional when colored lengths must go lighter", () => {
    expect(findPaths(hair(4, { history: "dyed", naturalLevel: 4 }), goalOf("7.0")).professional).toBe(true);
  });
});

describe("boxesNeeded", () => {
  it("scales with length and density", () => {
    expect(boxesNeeded("short", "high").boxes).toBe(1);
    expect(boxesNeeded("medium", "medium").boxes).toBe(1);
    expect(boxesNeeded("long", "high").boxes).toBe(3);
    expect(boxesNeeded(undefined).note).toMatch(/second box/);
  });

  it("maps YouCam detection terms", () => {
    expect(lengthFromYouCam("long hair")).toBe("long");
    expect(lengthFromYouCam("ear length")).toBe("very-short");
    expect(densityFromYouCam("High Density")).toBe("high");
    expect(densityFromYouCam(undefined)).toBeUndefined();
  });
});

describe("measurement suggestions", () => {
  it("needs enough pixels and ignores highlights and shadows", () => {
    expect(robustHairLab([{ L: 30, a: 5, b: 10 }])).toBeNull();
    const pixels = [
      ...Array.from({ length: 80 }, () => ({ L: 30, a: 6, b: 12 })),
      ...Array.from({ length: 10 }, () => ({ L: 95, a: 0, b: 0 })),
      ...Array.from({ length: 10 }, () => ({ L: 2, a: 0, b: 0 })),
    ];
    expect(robustHairLab(pixels)).toEqual({ L: 30, a: 6, b: 12 });
  });

  it("lets the measured color decide, with YouCam's class as a second opinion", () => {
    const lab = naturalLab(4);
    const measured = { ...lab, L: lab.L - CAMERA_L_OFFSET };
    const alone = suggestFromLab(measured);
    expect(alone.level).toBe(4);
    const agrees = suggestFromLab(measured, "Brown");
    expect(agrees.level).toBe(4);
    expect(agrees.classDisagrees).toBe(false);
    expect(agrees.confidence).toBeGreaterThan(alone.confidence);
    expect(classNote("Brown", agrees)).toBeUndefined();
    const differs = suggestFromLab(measured, "Blonde");
    expect(differs.level).toBe(4);
    expect(differs.classDisagrees).toBe(true);
    expect(differs.confidence).toBeLessThan(alone.confidence);
    expect(classNote("Blonde", differs)).toMatch(/reads darker/);
  });

  it("keeps light hair light when YouCam's class says Black", () => {
    // Measured on this device from public-domain NASA portraits (light-medium brown, light brown and dark blonde hair)
    // whose YouCam class came back "Black" in a live test.
    const portraits = [
      [{ L: 23.7, a: 4.7, b: 10.3 }, 4],
      [{ L: 30.2, a: 6.2, b: 17.8 }, 4.5],
      [{ L: 37.4, a: 4.7, b: 16.8 }, 5.5],
    ] as const;
    for (const [lab, level] of portraits) {
      const s = suggestFromLab(lab, "Black");
      expect(s.level).toBe(level);
      expect(s.classDisagrees).toBe(true);
      expect(classNote("Black", s)).toMatch(/reads lighter/);
    }
  });

  it("needs gray in the strands before believing a Grey/White class", () => {
    // Live test: dark hair with no light, colorless strands, while YouCam's class said "Grey/White".
    const dark = readHair(Array.from({ length: 200 }, (_, i) => ({ L: 4 + (i % 16), a: 2.5, b: 1.7 })))!;
    const s = suggestFromLab(dark.lab, "Grey/White", dark);
    expect(s.suggestGray).toBeUndefined();
    expect(s.level).toBeLessThanOrEqual(2);
    expect(classNote("Grey/White", s)).toMatch(/set Gray share yourself/);
    // With a few light, colorless strands, the class counts: a little gray.
    const few = readHair([
      ...Array.from({ length: 180 }, () => ({ L: 15, a: 2, b: 2 })),
      ...Array.from({ length: 20 }, () => ({ L: 70, a: 0, b: 2 })),
    ])!;
    expect(suggestFromLab(few.lab, "Grey/White", few).suggestGray).toBe("some");
  });

  it("falls back to the class midpoint", () => {
    expect(suggestFromHairClass("Black")?.level).toBe(2);
    expect(suggestFromHairClass("Grey/White")?.suggestGray).toBe("most");
    expect(suggestFromHairClass("Purple")).toBeNull();
  });

  it("reads salt-and-pepper hair as dark hair with gray, not as a light ashy shade", () => {
    // Measured on a real photo of short dark hair with lots of gray: rgb(114, 108, 103).
    const saltAndPepper = { L: 46.2, a: 1.2, b: 3.5 };
    const s = suggestFromLab(saltAndPepper);
    expect(s.suggestGray).toBe("half");
    expect(s.level).toBeLessThanOrEqual(3);
    expect(s.tone).toBe("neutral");
    expect(suggestFromLab(saltAndPepper, "Brown").level).toBeGreaterThanOrEqual(2);
  });

  it("does not mistake natural ash blonde for gray", () => {
    const ash = describedHairLab(8, "cool");
    const s = suggestFromLab({ ...ash, L: ash.L - CAMERA_L_OFFSET });
    expect(s.suggestGray).toBeUndefined();
    expect(s.level).toBe(8);
    expect(s.tone).toBe("cool");
  });

  it("ignores a red class from YouCam when the measured hair shows no warmth", () => {
    // Live test: very dark brown hair measured rgb(52, 43, 46) on device, while YouCam's class said "Auburn".
    const s = suggestFromLab(hexToLab("#342B2E"), "Auburn");
    expect(s.tone).toBe("neutral");
    expect(s.level).toBe(3);
  });

  it("keeps red when the class and the measurement agree", () => {
    const red = describedHairLab(6, "red");
    expect(suggestFromLab({ ...red, L: red.L - CAMERA_L_OFFSET }, "Red").tone).toBe("red");
  });

  it("never reads dull dark brown hair as gray or ash (photos make dark hair look flat)", () => {
    // Dark brown hair in an ordinary phone photo: dark and nearly colorless.
    const dull = { L: 26, a: 2, b: 3 };
    const evidence = readHair(Array.from({ length: 200 }, (_, i) => ({ L: 20 + (i % 12), a: 2, b: 3 })));
    for (const s of [suggestFromLab(dull), suggestFromLab(dull, "Brown"), suggestFromLab(dull, undefined, evidence!)]) {
      expect(s.suggestGray).toBeUndefined();
      expect(s.level).toBe(4);
      expect(s.tone).toBe("neutral");
    }
    // A dull medium brown still isn't called ash: that's only suggested for blondes.
    const medium = naturalLab(5);
    expect(suggestFromLab({ L: medium.L - CAMERA_L_OFFSET, a: 1.5, b: 3 }, "Brown").tone).toBe("neutral");
  });

  it("sees salt and pepper in the strands and reads the level from the pigmented ones", () => {
    const pepper = Array.from({ length: 120 }, () => ({ L: 18, a: 3, b: 6 }));
    const salt = Array.from({ length: 80 }, () => ({ L: 74, a: 0.5, b: 3 }));
    const reading = readHair([...pepper, ...salt])!;
    expect(reading.grayPixels).toBeCloseTo(0.4);
    expect(reading.darkPixels).toBeCloseTo(0.6);
    expect(reading.pigmented).toEqual({ L: 18, a: 3, b: 6 });
    const s = suggestFromLab(reading.lab, undefined, reading);
    expect(s.suggestGray).toBe("some");
    expect(s.level).toBe(3);
    expect(suggestFromLab(reading.lab, "Grey/White", reading).suggestGray).toBe("half");
    // When YouCam saw a hair color, partial gray is left for the person to set, but the level still comes from the
    // pigmented strands.
    const named = suggestFromLab(reading.lab, "Black", reading);
    expect(named.suggestGray).toBeUndefined();
    expect(named.level).toBe(3);
    expect(named.tone).not.toBe("cool");
  });
});
