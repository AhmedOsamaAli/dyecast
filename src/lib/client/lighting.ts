import { rgbToLab } from "@/lib/color";

/** Light in a photo, summarized from its pixels (CIELAB). */
export interface LightingStats {
  /** Average lightness, 0–100. */
  meanL: number;
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
  let count = 0;
  let sumL = 0;
  let clipped = 0;
  let bright = 0;
  let sumA = 0;
  let sumB = 0;
  for (let p = 0; p < pixels; p += step) {
    const i = p * 4;
    const lab = rgbToLab({ r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] });
    count++;
    sumL += lab.L;
    if (lab.L > 97) clipped++;
    else if (lab.L >= 65) {
      bright++;
      sumA += lab.a;
      sumB += lab.b;
    }
  }
  if (!count) return { meanL: 0, clipped: 0, castA: 0, castB: 0 };
  // The light's own color only shows reliably when there are enough bright areas (walls, highlights).
  const enoughBright = bright >= count * 0.02;
  return {
    meanL: sumL / count,
    clipped: clipped / count,
    castA: enoughBright ? sumA / bright : 0,
    castB: enoughBright ? sumB / bright : 0,
  };
}

/** Whether a photo's light lets hair color read true, with plain-language fixes. Thresholds stay lenient on purpose. */
export function assessLighting(stats: LightingStats): LightingAdvice {
  const found: LightingIssue[] = [];
  if (stats.meanL < 28) found.push("too-dark");
  if (stats.clipped > 0.12) found.push("harsh");
  if (stats.castB > 16) found.push("yellow-light");
  else if (stats.castB < -8) found.push("blue-light");
  if (Math.abs(stats.castA) > 10) found.push("tinted");
  return { ok: found.length === 0, issues: found.map((id) => ({ id, text: MESSAGES[id] })) };
}

/** Checks a photo's light on this device. */
export async function checkPhotoLighting(photo: Blob): Promise<LightingAdvice> {
  const bitmap = await createImageBitmap(photo);
  try {
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ok: true, issues: [] };
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return assessLighting(lightingStats(ctx.getImageData(0, 0, canvas.width, canvas.height).data));
  } finally {
    bitmap.close();
  }
}
