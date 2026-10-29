"use client";

import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import { hexToLab, type Lab } from "@/lib/color";
import { readHair, robustHairLab, type HairReading } from "@/lib/engine/measure";
import { blobToCanvas } from "@/lib/client/image";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";
/** selfie_multiclass labels: 0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 other. */
const HAIR = 1;
const FACE_SKIN = 3;

let segmenter: Promise<ImageSegmenter> | null = null;

function getSegmenter(): Promise<ImageSegmenter> {
  segmenter ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(WASM_BASE);
    return ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
      runningMode: "IMAGE",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  })().catch((error) => {
    segmenter = null;
    throw error;
  });
  return segmenter;
}

export interface HairMask {
  width: number;
  height: number;
  /** Per-pixel hair confidence 0–1. */
  alpha: Float32Array;
  /** Pixels that are confidently hair (confidence > 0.5). */
  pixels: number;
  /** Per-pixel face-skin confidence 0–1. */
  face?: Float32Array;
}

/** Confident hair pixels needed to measure or recolor: about a 50×50 px patch, so short hair still counts. */
export const MIN_HAIR_PIXELS = 2500;

export function hasHair(mask: HairMask | null): mask is HairMask {
  return Boolean(mask && mask.pixels >= MIN_HAIR_PIXELS);
}

/** On-device hair segmentation (the photo never leaves the browser). */
export async function segmentHair(canvas: HTMLCanvasElement): Promise<HairMask | null> {
  const seg = await getSegmenter();
  const result = seg.segment(canvas);
  try {
    const mask = result.confidenceMasks?.[HAIR];
    if (!mask) return null;
    const alpha = new Float32Array(mask.getAsFloat32Array());
    let hair = 0;
    for (let i = 0; i < alpha.length; i++) if (alpha[i] > 0.5) hair++;
    const faceMask = result.confidenceMasks?.[FACE_SKIN];
    const face = faceMask ? new Float32Array(faceMask.getAsFloat32Array()) : undefined;
    return { width: mask.width, height: mask.height, alpha, pixels: hair, face };
  } finally {
    result.close();
  }
}

// ---- Fast per-pixel color math (lookup table for sRGB → linear) ----
const LINEAR = new Float32Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const fInv = (t: number) => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787);
const toSrgb = (v: number) => {
  const c = v <= 0 ? 0 : v >= 1 ? 1 : v;
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
};

function pixelLab(r: number, g: number, b: number, out: Float32Array) {
  const R = LINEAR[r], G = LINEAR[g], B = LINEAR[b];
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fx = f(x), fy = f(y), fz = f(z);
  out[0] = 116 * fy - 16;
  out[1] = 500 * (fx - fy);
  out[2] = 200 * (fy - fz);
}

function labPixel(L: number, a: number, b: number, data: Uint8ClampedArray, i: number, mix: number) {
  const fy = (L + 16) / 116;
  const x = 0.95047 * fInv(fy + a / 500);
  const y = fInv(fy);
  const z = 1.08883 * fInv(fy - b / 200);
  const r = toSrgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z);
  const g = toSrgb(-0.969266 * x + 1.8760108 * y + 0.041556 * z);
  const bl = toSrgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z);
  data[i] += (r - data[i]) * mix;
  data[i + 1] += (g - data[i + 1]) * mix;
  data[i + 2] += (bl - data[i + 2]) * mix;
}

/** Lab samples (about 60,000 across the photo) where a mask is confident. */
function sampleWhere(canvas: HTMLCanvasElement, weights: Float32Array, min: number): Lab[] {
  const ctx = canvas.getContext("2d");
  if (!ctx || weights.length !== canvas.width * canvas.height) return [];
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const lab = new Float32Array(3);
  const samples: Lab[] = [];
  const step = Math.max(1, Math.floor(Math.sqrt((canvas.width * canvas.height) / 60000)));
  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const p = y * canvas.width + x;
      if (weights[p] < min) continue;
      pixelLab(data[p * 4], data[p * 4 + 1], data[p * 4 + 2], lab);
      samples.push({ L: lab[0], a: lab[1], b: lab[2] });
    }
  }
  return samples;
}

/** Hair color from the confidently-hair pixels of a photo: the robust typical color plus gray-strand evidence. */
export function measureHair(canvas: HTMLCanvasElement, mask: HairMask): HairReading | null {
  if (mask.width !== canvas.width || mask.height !== canvas.height) return null;
  return readHair(sampleWhere(canvas, mask.alpha, 0.85));
}

/** Typical face-skin color, used to tell colored light from colorful surroundings. Null when no face was found. */
export function measureSkin(canvas: HTMLCanvasElement, mask: HairMask): Lab | null {
  if (!mask.face || mask.width !== canvas.width || mask.height !== canvas.height) return null;
  return robustHairLab(sampleWhere(canvas, mask.face, 0.85));
}

export interface PhotoReading {
  /** Null when too little hair shows. */
  hair: HairReading | null;
  skin: Lab | null;
}

/** Everything DyeCast reads from a photo on this device. Null when the on-device model can't run. */
export async function readPhoto(photo: Blob): Promise<PhotoReading | null> {
  try {
    const canvas = await blobToCanvas(photo);
    const mask = await segmentHair(canvas);
    if (!mask) return null;
    return { hair: hasHair(mask) ? measureHair(canvas, mask) : null, skin: measureSkin(canvas, mask) };
  } catch {
    return null;
  }
}

export interface RecolorTarget {
  /** Color for the roots (top of the hair). */
  roots: string;
  /** Color for the lengths. */
  lengths: string;
  /** Share of the hair height (from the top) that shows the roots color. */
  rootsShare?: number;
}

/**
 * Recolors only the hair, keeping each pixel's light and shadow so the texture stays real.
 * Used as the free on-device preview (and when YouCam rendering isn't available).
 */
export function recolorHair(canvas: HTMLCanvasElement, mask: HairMask, target: RecolorTarget): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d");
  if (!ctx || mask.width !== canvas.width || mask.height !== canvas.height) return canvas;
  ctx.drawImage(canvas, 0, 0);
  const image = ctx.getImageData(0, 0, out.width, out.height);
  const { data } = image;
  const lab = new Float32Array(3);

  let top = out.height, bottom = 0, n = 0, mL = 0, mA = 0, mB = 0;
  for (let p = 0; p < mask.alpha.length; p++) {
    if (mask.alpha[p] < 0.7) continue;
    const y = Math.floor(p / out.width);
    if (y < top) top = y;
    if (y > bottom) bottom = y;
    pixelLab(data[p * 4], data[p * 4 + 1], data[p * 4 + 2], lab);
    mL += lab[0]; mA += lab[1]; mB += lab[2]; n++;
  }
  if (!n) return out;
  mL /= n; mA /= n; mB /= n;

  const rootsLab = hexToLab(target.roots);
  const lengthsLab = hexToLab(target.lengths);
  const share = target.rootsShare ?? 0.2;
  const span = Math.max(1, bottom - top);
  for (let p = 0; p < mask.alpha.length; p++) {
    const alpha = mask.alpha[p];
    if (alpha < 0.05) continue;
    const y = Math.floor(p / out.width);
    const pos = (y - top) / span;
    const t = Math.min(1, Math.max(0, (pos - (share - 0.08)) / 0.16));
    const tL = rootsLab.L + (lengthsLab.L - rootsLab.L) * t;
    const tA = rootsLab.a + (lengthsLab.a - rootsLab.a) * t;
    const tB = rootsLab.b + (lengthsLab.b - rootsLab.b) * t;
    const i = p * 4;
    pixelLab(data[i], data[i + 1], data[i + 2], lab);
    const L = tL + (lab[0] - mL) * 0.85;
    labPixel(L, tA + (lab[1] - mA) * 0.25, tB + (lab[2] - mB) * 0.25, data, i, Math.min(1, alpha * 1.15));
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create the preview."))), "image/jpeg", 0.9),
  );
}
