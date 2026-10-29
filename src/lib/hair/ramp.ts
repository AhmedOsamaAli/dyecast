import { hexToLab, labToLch, labToRgb, lchToLab, type Lab, type RGB } from "@/lib/color";

/** Evenly spaced stops of the gradient map, from the texture's darkest gray (0) to its brightest (1). */
export const RAMP_STOPS = 11;

/**
 * The color of a lock at one gray level of the hair texture, for a lock whose overall color is `target`.
 * Gray 0.5 (the texture's average) is the target itself. Darker grays fall into shadow with a little less
 * chroma; lighter grays rise to a paler, less saturated shine, like light reflecting off the hair surface.
 * Hue never changes, so the lock reads as one color.
 */
export function rampLab(target: Lab, gray: number): Lab {
  const { L, C, h } = labToLch(target);
  if (gray <= 0.5) {
    const k = gray / 0.5;
    const floor = 0.28 + 0.32 * (L / 100);
    return lchToLab({ L: L * (floor + (1 - floor) * k ** 1.1), C: C * (0.8 + 0.2 * k), h });
  }
  const k = (gray - 0.5) / 0.5;
  const top = Math.min(98, L + 26 + 16 * (1 - L / 100));
  return lchToLab({ L: L + (top - L) * k ** 1.6, C: C * (1 - 0.6 * k ** 1.4), h });
}

/** The gradient map for one color as sRGB stops (0–255 per channel). */
export function rampStops(hex: string): RGB[] {
  const target = hexToLab(hex);
  return Array.from({ length: RAMP_STOPS }, (_, i) => labToRgb(rampLab(target, i / (RAMP_STOPS - 1))));
}

/** `tableValues` for an SVG feComponentTransfer (one per channel), applied to the gray texture. */
export function rampTables(hex: string): { r: string; g: string; b: string } {
  const stops = rampStops(hex);
  const table = (channel: keyof RGB) => stops.map((s) => (s[channel] / 255).toFixed(4)).join(" ");
  return { r: table("r"), g: table("g"), b: table("b") };
}

/**
 * The same gradient map as a 256-entry lookup table (r, g, b per entry) for colorizing on a canvas.
 * Interpolates the stops linearly, exactly as feComponentTransfer's table does.
 */
export function rampLut(hex: string): Uint8ClampedArray {
  const stops = rampStops(hex);
  const lut = new Uint8ClampedArray(256 * 3);
  const last = RAMP_STOPS - 1;
  for (let v = 0; v < 256; v++) {
    const x = (v / 255) * last;
    const i = Math.min(last - 1, Math.floor(x));
    const t = x - i;
    lut[v * 3] = Math.round(stops[i].r + (stops[i + 1].r - stops[i].r) * t);
    lut[v * 3 + 1] = Math.round(stops[i].g + (stops[i + 1].g - stops[i].g) * t);
    lut[v * 3 + 2] = Math.round(stops[i].b + (stops[i + 1].b - stops[i].b) * t);
  }
  return lut;
}
