import { describe, expect, it } from "vitest";
import {
  deltaE2000,
  hexToLab,
  hexToRgb,
  labToHex,
  labToLch,
  lchToLab,
  mixLab,
  rgbToHex,
  type Lab,
} from "../index";

// Reference pairs from Sharma, Wu & Dalal (2005), "The CIEDE2000 Color-Difference Formula".
const SHARMA: Array<[Lab, Lab, number]> = [
  [{ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 }, 2.0425],
  [{ L: 50, a: 3.1571, b: -77.2803 }, { L: 50, a: 0, b: -82.7485 }, 2.8615],
  [{ L: 50, a: 2.8361, b: -74.02 }, { L: 50, a: 0, b: -82.7485 }, 3.4412],
  [{ L: 50, a: -1.3802, b: -84.2814 }, { L: 50, a: 0, b: -82.7485 }, 1.0],
  [{ L: 50, a: -1.1848, b: -84.8006 }, { L: 50, a: 0, b: -82.7485 }, 1.0],
  [{ L: 50, a: -0.9009, b: -85.5211 }, { L: 50, a: 0, b: -82.7485 }, 1.0],
  [{ L: 50, a: 0, b: 0 }, { L: 50, a: -1, b: 2 }, 2.3669],
  [{ L: 50, a: -1, b: 2 }, { L: 50, a: 0, b: 0 }, 2.3669],
  [{ L: 50, a: 2.49, b: -0.001 }, { L: 50, a: -2.49, b: 0.0009 }, 7.1792],
  [{ L: 50, a: 2.49, b: -0.001 }, { L: 50, a: -2.49, b: 0.001 }, 7.1792],
  [{ L: 50, a: 2.49, b: -0.001 }, { L: 50, a: -2.49, b: 0.0011 }, 7.2195],
  [{ L: 50, a: 2.49, b: -0.001 }, { L: 50, a: -2.49, b: 0.0012 }, 7.2195],
  [{ L: 50, a: -0.001, b: 2.49 }, { L: 50, a: 0.0009, b: -2.49 }, 4.8045],
  [{ L: 50, a: -0.001, b: 2.49 }, { L: 50, a: 0.001, b: -2.49 }, 4.8045],
  [{ L: 50, a: -0.001, b: 2.49 }, { L: 50, a: 0.0011, b: -2.49 }, 4.7461],
  [{ L: 50, a: 2.5, b: 0 }, { L: 50, a: 0, b: -2.5 }, 4.3065],
  [{ L: 50, a: 2.5, b: 0 }, { L: 73, a: 25, b: -18 }, 27.1492],
  [{ L: 50, a: 2.5, b: 0 }, { L: 61, a: -5, b: 29 }, 22.8977],
  [{ L: 50, a: 2.5, b: 0 }, { L: 56, a: -27, b: -3 }, 31.903],
  [{ L: 50, a: 2.5, b: 0 }, { L: 58, a: 24, b: 15 }, 19.4535],
  [{ L: 50, a: 2.5, b: 0 }, { L: 50, a: 3.1736, b: 0.5854 }, 1.0],
  [{ L: 50, a: 2.5, b: 0 }, { L: 50, a: 3.2972, b: 0 }, 1.0],
  [{ L: 50, a: 2.5, b: 0 }, { L: 50, a: 1.8634, b: 0.5757 }, 1.0],
  [{ L: 50, a: 2.5, b: 0 }, { L: 50, a: 3.2592, b: 0.335 }, 1.0],
  [{ L: 60.2574, a: -34.0099, b: 36.2677 }, { L: 60.4626, a: -34.1751, b: 39.4387 }, 1.2644],
  [{ L: 63.0109, a: -31.0961, b: -5.8663 }, { L: 62.8187, a: -29.7946, b: -4.0864 }, 1.263],
  [{ L: 61.2901, a: 3.7196, b: -5.3901 }, { L: 61.4292, a: 2.248, b: -4.962 }, 1.8731],
  [{ L: 35.0831, a: -44.1164, b: 3.7933 }, { L: 35.0232, a: -40.0716, b: 1.5901 }, 1.8645],
  [{ L: 22.7233, a: 20.0904, b: -46.694 }, { L: 23.0331, a: 14.973, b: -42.5619 }, 2.0373],
  [{ L: 36.4612, a: 47.858, b: 18.3852 }, { L: 36.2715, a: 50.5065, b: 21.2231 }, 1.4146],
  [{ L: 90.8027, a: -2.0831, b: 1.441 }, { L: 91.1528, a: -1.6435, b: 0.0447 }, 1.4441],
  [{ L: 90.9257, a: -0.5406, b: -0.9208 }, { L: 88.6381, a: -0.8985, b: -0.7239 }, 1.5381],
  [{ L: 6.7747, a: -0.2908, b: -2.4247 }, { L: 5.8714, a: -0.0985, b: -2.2286 }, 0.6377],
  [{ L: 2.0776, a: 0.0795, b: -1.135 }, { L: 0.9033, a: -0.0636, b: -0.5514 }, 0.9082],
];

describe("deltaE2000", () => {
  it.each(SHARMA.map((row, i) => [i + 1, ...row] as const))(
    "matches Sharma et al. reference pair %i",
    (_i, lab1, lab2, expected) => {
      expect(deltaE2000(lab1, lab2)).toBeCloseTo(expected, 4);
    },
  );

  it("is zero for identical colors and symmetric", () => {
    const a = hexToLab("#7a5532");
    const b = hexToLab("#c46f27");
    expect(deltaE2000(a, a)).toBe(0);
    expect(deltaE2000(a, b)).toBeCloseTo(deltaE2000(b, a), 10);
  });
});

describe("conversions", () => {
  it("parses and formats hex", () => {
    expect(hexToRgb("#FF8000")).toEqual({ r: 255, g: 128, b: 0 });
    expect(hexToRgb("ff8000")).toEqual({ r: 255, g: 128, b: 0 });
    expect(rgbToHex({ r: 255, g: 128, b: 0 })).toBe("#ff8000");
    expect(() => hexToRgb("#zzz")).toThrow();
  });

  it("maps white and black to the expected CIELAB anchors", () => {
    const white = hexToLab("#ffffff");
    expect(white.L).toBeCloseTo(100, 2);
    expect(Math.abs(white.a)).toBeLessThan(0.01);
    expect(Math.abs(white.b)).toBeLessThan(0.01);
    expect(hexToLab("#000000").L).toBeCloseTo(0, 5);
  });

  it("round-trips hex -> Lab -> hex", () => {
    for (const hex of ["#120e0d", "#7a5532", "#e3cfa2", "#c46f27", "#336699", "#b9947c"]) {
      expect(labToHex(hexToLab(hex))).toBe(hex);
    }
  });

  it("round-trips Lab -> LCh -> Lab", () => {
    const lab = { L: 45, a: 18, b: 32 };
    const back = lchToLab(labToLch(lab));
    expect(back.L).toBeCloseTo(lab.L, 10);
    expect(back.a).toBeCloseTo(lab.a, 10);
    expect(back.b).toBeCloseTo(lab.b, 10);
  });

  it("mixes linearly and clamps t", () => {
    const a = { L: 0, a: 0, b: 0 };
    const b = { L: 100, a: 10, b: -10 };
    expect(mixLab(a, b, 0.5)).toEqual({ L: 50, a: 5, b: -5 });
    expect(mixLab(a, b, 2)).toEqual(b);
  });
});
