import { rgbToLab, type Lab } from "@/lib/color";

/** Light in a photo, summarized from its pixels (CIELAB). */
export interface LightingStats {
  /**
   * Lightness of the brightest tenth of the photo (90th percentile), 0–100: how much light the scene has. Unlike the
   * average, it isn't pulled down by a dark background, dark clothes or a deep skin tone.
   */
  brightL: number;
  /** Share of pixels blown out to white. */
  clipped: number;
  /** Average color of the bright, not blown-out areas (a*, b*): what the light itself adds. 0 when unknown. */
  castA: number;
  castB: number;
}

export type LightingIssue = "too-dark" | "harsh" | "yellow-light" | "blue-light" | "tinted";

export interface LightingAdvice {
  ok: boolean;
  issues: Array<{ id: LightingIssue; text: string }>;
}

const MESSAGES: Record<LightingIssue, string> = {
  "too-dark": "This photo is quite dark, so your hair will read darker than it is. Face a window or add light.",
  harsh: "Harsh light blows out parts of this photo. Soft daylight gives the truest colour.",
  "yellow-light": "The light looks yellow (indoor bulbs?), which makes hair read more golden or red. Daylight from a window is best.",
  "blue-light": "The light looks blue, which makes hair read ashier than it is. Daylight from a window is best.",
  tinted: "The light has a strong colour tint (a filter or coloured light?). Use plain daylight with no filter.",
};

/** Summarizes an RGBA pixel buffer (as from canvas getImageData), sampling about `samples` pixels. */
export function lightingStats(rgba: Uint8ClampedArray, samples = 20000): LightingStats {
  const pixels = rgba.length / 4;
  const step = Math.max(1, Math.floor(pixels / samples));
  const lightness = new Float32Array(Math.ceil(pixels / step));
  let count = 0;
  let clipped = 0;
  let bright = 0;
  let sumA = 0;
  let sumB = 0;
  for (let p = 0; p < pixels; p += step) {
    const i = p * 4;
    const lab = rgbToLab({ r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] });
    lightness[count++] = lab.L;
    if (lab.L > 97) clipped++;
    else if (lab.L >= 65) {
      bright++;
      sumA += lab.a;
      sumB += lab.b;
    }
  }
  if (!count) return { brightL: 0, clipped: 0, castA: 0, castB: 0 };
  const sorted = lightness.subarray(0, count).sort();
  // The light's own color only shows reliably when there are enough bright areas (walls, highlights).
  const enoughBright = bright >= count * 0.02;
  return {
    brightL: sorted[Math.min(count - 1, Math.floor(count * 0.9))],
    clipped: clipped / count,
    castA: enoughBright ? sumA / bright : 0,
    castB: enoughBright ? sumB / bright : 0,
  };
}

const hueOf = (lab: Lab) => (Math.atan2(lab.b, lab.a) * 180) / Math.PI;

/**
 * Whether a photo's light lets hair color read true, with plain-language fixes. Thresholds stay lenient on purpose.
 *
 * Bright areas can be colorful things rather than colored light (a gold badge, a warm wall), so when a face was found
 * its skin must show the same cast. Face skin sits at about the same CIELAB hue (roughly 45–60°) for every skin tone,
 * from very light to very deep, so this check is fair to all of them; colored light pushes the hue out of that range.
 */
export function assessLighting(stats: LightingStats, skin?: Lab | null): LightingAdvice {
  const found: LightingIssue[] = [];
  if (stats.brightL < 40) found.push("too-dark");
  if (stats.clipped > 0.12) found.push("harsh");
  const hue = skin ? hueOf(skin) : null;
  const chroma = skin ? Math.hypot(skin.a, skin.b) : 0;
  const skinYellow = hue === null || (hue >= 60 && chroma >= 40);
  const skinBlue = hue === null || hue <= 38 || chroma < 8;
  const skinTinted = hue === null || hue < 30 || hue > 75;
  if (stats.castB > 16 && skinYellow) found.push("yellow-light");
  else if (stats.castB < -8 && skinBlue) found.push("blue-light");
  if (Math.abs(stats.castA) > 10 && skinTinted) found.push("tinted");
  return { ok: found.length === 0, issues: found.map((id) => ({ id, text: MESSAGES[id] })) };
}

/** Checks a photo's light on this device. `skin` is the face-skin color found in it, if any. */
export async function checkPhotoLighting(photo: Blob, skin?: Lab | null): Promise<LightingAdvice> {
  const bitmap = await createImageBitmap(photo);
  try {
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ok: true, issues: [] };
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return assessLighting(lightingStats(ctx.getImageData(0, 0, canvas.width, canvas.height).data), skin);
  } finally {
    bitmap.close();
  }
}
