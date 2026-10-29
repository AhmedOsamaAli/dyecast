import { describe, expect, it } from "vitest";
import { assessLighting, lightingStats } from "../lighting";

type Rgb = [number, number, number];

/** A fake photo: `share` of the pixels in each color. */
function photo(parts: Array<[number, Rgb]>, size = 10000): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * 4);
  let p = 0;
  for (const [share, [r, g, b]] of parts) {
    const end = Math.min(size, p + Math.round(share * size));
    for (; p < end; p++) data.set([r, g, b, 255], p * 4);
  }
  return data;
}

const ids = (data: Uint8ClampedArray) => assessLighting(lightingStats(data)).issues.map((i) => i.id);

describe("lighting check", () => {
  it("passes a portrait in soft daylight", () => {
    const daylight = photo([[0.45, [120, 98, 84]], [0.35, [72, 56, 46]], [0.2, [228, 226, 222]]]);
    expect(assessLighting(lightingStats(daylight))).toEqual({ ok: true, issues: [] });
  });

  it("flags a dark photo, which makes hair read darker", () => {
    expect(ids(photo([[1, [34, 30, 28]]]))).toContain("too-dark");
  });

  it("doesn't call a dark background, dark clothes or a deep skin tone too dark", () => {
    // A studio portrait: navy backdrop and suit, deep skin, a few bright highlights.
    expect(ids(photo([[0.55, [22, 30, 52]], [0.3, [92, 62, 48]], [0.15, [205, 200, 196]]]))).not.toContain("too-dark");
  });

  it("needs the face to show a color cast before blaming the light, for every skin tone", () => {
    // Gold badges and a warm backdrop make the bright areas yellow, but the faces (measured on public-domain NASA
    // portraits, from very light to deep skin) keep normal skin hues: the light is fine.
    const warmThings = photo([[0.7, [120, 98, 84]], [0.3, [255, 221, 150]]]);
    const faces = [
      { L: 72.2, a: 11.9, b: 14.3 },
      { L: 70.3, a: 17.5, b: 18.8 },
      { L: 63, a: 12.7, b: 19.4 },
      { L: 61.4, a: 20.8, b: 30.5 },
      { L: 35.4, a: 17.7, b: 20.3 },
    ];
    for (const skin of faces) expect(assessLighting(lightingStats(warmThings), skin).ok).toBe(true);
    // Under yellow light the skin turns yellow too (the same portrait with a yellow cast).
    const yellowFace = { L: 69.7, a: 23.7, b: 50.4 };
    expect(assessLighting(lightingStats(warmThings), yellowFace).issues.map((i) => i.id)).toEqual(["yellow-light"]);
  });

  it("flags yellow indoor light and blue light from the bright areas", () => {
    expect(ids(photo([[0.7, [120, 98, 84]], [0.3, [255, 221, 150]]]))).toEqual(["yellow-light"]);
    expect(ids(photo([[0.7, [120, 98, 84]], [0.3, [178, 200, 255]]]))).toEqual(["blue-light"]);
  });

  it("flags blown-out highlights and strongly tinted light", () => {
    expect(ids(photo([[0.75, [120, 98, 84]], [0.25, [255, 255, 255]]]))).toContain("harsh");
    expect(ids(photo([[0.7, [120, 98, 84]], [0.3, [160, 235, 160]]]))).toContain("tinted");
  });

  it("doesn't guess the light's color when there's nothing bright to read it from", () => {
    const stats = lightingStats(photo([[1, [120, 98, 84]]]));
    expect([stats.castA, stats.castB]).toEqual([0, 0]);
  });
});
