"use client";

import { cropAlign, fadeAt, HAIR_TEXTURE, isMirrored, SWATCH_H, swatchLayers, type SwatchInput } from "@/lib/hair/texture";
import { rampLut } from "@/lib/hair/ramp";

export type CardVisual = { kind: "image"; src: string } | { kind: "swatch"; swatch: SwatchInput };

export interface CardPanel {
  label: string;
  caption: string;
  visual: CardVisual;
  highlight?: boolean;
}

export interface CardSpec {
  title: string;
  subtitle: string;
  zone: "close" | "different" | "very-different";
  gap: number;
  gapText: string;
  changes: Array<{ tone: "good" | "warn" | "bad"; title: string }>;
  panels: CardPanel[];
}

const W = 1080;
const H = 1350;
const PAD = 64;
const INK = "#231d18";
const MUTED = "#6f665c";
const ACCENT = "#8a4530";
const TONE_COLOR = { good: "#4f7a45", warn: "#b7791f", bad: "#b4472e" } as const;
const ZONE_COLOR = { close: "#7fa36f", different: "#e0b04f", "very-different": "#cc6a4c" } as const;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("An image couldn't be loaded for the card."));
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws an image like CSS object-fit: cover, keeping the upper part (faces and hair) in view. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) * 0.3;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

const textures = new Map<string, Promise<ImageData>>();

/** Pixels of a same-origin texture (cached; a failed load is retried next time). */
function texturePixels(src: string): Promise<ImageData> {
  let pixels = textures.get(src);
  if (!pixels) {
    pixels = loadImage(src).then((img) => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Your browser can't create images.");
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    });
    pixels.catch(() => textures.delete(src));
    textures.set(src, pixels);
  }
  return pixels;
}

/** Colors the hair photo with the same layers and gradient maps as the on-page SVG swatch. */
async function colorHair(input: SwatchInput): Promise<HTMLCanvasElement> {
  const layers = swatchLayers(input);
  const [hair, ...masks] = await Promise.all([
    texturePixels(HAIR_TEXTURE),
    ...layers.map((layer) => (layer.strands ? texturePixels(layer.strands) : null)),
  ]);
  const luts = layers.map((layer) => rampLut(layer.hex));
  const { width, height, data } = hair;
  const out = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    const at = ((y + 0.5) / height) * SWATCH_H;
    const rowWeight = layers.map(
      (layer) => (layer.roots ? fadeAt(layer.roots, at) : 1) * (layer.belowRoots ? 1 - fadeAt(layer.belowRoots, at) : 1),
    );
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const g = data[i] * 3;
      let r = luts[0][g];
      let gr = luts[0][g + 1];
      let b = luts[0][g + 2];
      for (let k = 1; k < layers.length; k++) {
        const mask = masks[k - 1];
        const w = rowWeight[k] * (mask ? mask.data[i] / 255 : 1);
        if (w <= 0) continue;
        r += (luts[k][g] - r) * w;
        gr += (luts[k][g + 1] - gr) * w;
        b += (luts[k][g + 2] - b) * w;
      }
      out.data[i] = r;
      out.data[i + 1] = gr;
      out.data[i + 2] = b;
      out.data[i + 3] = 255;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.putImageData(out, 0, 0);
  return canvas;
}

/** Fills a box with the same hair swatch as the page (like CSS object-fit: cover, showing the same part of the photo). */
export async function drawSwatch(ctx: CanvasRenderingContext2D, input: SwatchInput, x: number, y: number, w: number, h: number) {
  const hair = await colorHair(input);
  const scale = Math.max(w / hair.width, h / hair.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.save();
  if (isMirrored(input.seed)) {
    ctx.translate(2 * x + w, 0);
    ctx.scale(-1, 1);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(hair, (hair.width - sw) / 2, (hair.height - sh) * cropAlign(input), sw, sh, x, y, w, h);
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Fonts loaded on the page (next/font names are hashed), with safe fallbacks. */
function pageFonts() {
  const root = getComputedStyle(document.documentElement);
  return {
    display: root.getPropertyValue("--font-fraunces").trim() || "Georgia, serif",
    sans: root.getPropertyValue("--font-geist").trim() || "Arial, sans-serif",
  };
}

/** A shareable 1080×1350 "reality check" card: today, the box promise and the likely result, with the verdict. */
export async function composeCard(spec: CardSpec): Promise<Blob> {
  await document.fonts?.ready;
  const { display, sans } = pageFonts();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't create images.");

  ctx.fillStyle = "#fbf8f3";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = INK;
  ctx.font = `700 46px ${display}`;
  ctx.fillText("dyecast", PAD, 104);
  const mark = ctx.measureText("dyecast").width;
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(PAD + mark + 12, 96, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MUTED;
  ctx.font = `600 20px ${sans}`;
  ctx.textAlign = "right";
  ctx.fillText("HAIR COLOR REALITY CHECK", W - PAD, 102);
  ctx.textAlign = "left";

  ctx.fillStyle = INK;
  ctx.font = `400 54px ${display}`;
  let y = 196;
  for (const line of wrap(ctx, spec.title, W - PAD * 2).slice(0, 2)) {
    ctx.fillText(line, PAD, y);
    y += 62;
  }
  ctx.fillStyle = MUTED;
  ctx.font = `400 26px ${sans}`;
  ctx.fillText(spec.subtitle, PAD, y + 4);

  const gapX = 24;
  const pw = (W - PAD * 2 - gapX * (spec.panels.length - 1)) / spec.panels.length;
  const ph = Math.round(pw * 1.5);
  const py = y + 74;
  for (const [i, panel] of spec.panels.entries()) {
    const px = PAD + i * (pw + gapX);
    ctx.fillStyle = panel.highlight ? ACCENT : "#7a7066";
    ctx.font = `700 19px ${sans}`;
    ctx.fillText(panel.label.toUpperCase(), px, py - 14);
    ctx.save();
    roundRect(ctx, px, py, pw, ph, 18);
    ctx.clip();
    ctx.fillStyle = "#ebeae7";
    ctx.fillRect(px, py, pw, ph);
    if (panel.visual.kind === "image") drawCover(ctx, await loadImage(panel.visual.src), px, py, pw, ph);
    else await drawSwatch(ctx, panel.visual.swatch, px, py, pw, ph);
    ctx.restore();
    if (panel.highlight) {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 5;
      roundRect(ctx, px, py, pw, ph, 18);
      ctx.stroke();
    }
    ctx.fillStyle = INK;
    ctx.font = `600 22px ${sans}`;
    let cy = py + ph + 34;
    for (const line of wrap(ctx, panel.caption, pw).slice(0, 2)) {
      ctx.fillText(line, px, cy);
      cy += 28;
    }
  }

  let my = py + ph + 128;
  const bar = { x: PAD, w: W - PAD * 2, h: 14 };
  const max = 30;
  const zones: Array<[number, string]> = [[6, ZONE_COLOR.close], [12, ZONE_COLOR.different], [max, ZONE_COLOR["very-different"]]];
  let from = 0;
  for (const [to, color] of zones) {
    ctx.fillStyle = color;
    roundRect(ctx, bar.x + (from / max) * bar.w, my, ((to - from) / max) * bar.w - 4, bar.h, 7);
    ctx.fill();
    from = to;
  }
  const mx = bar.x + (Math.min(spec.gap, max) / max) * bar.w;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(Math.min(mx, bar.x + bar.w - 10), my + bar.h / 2, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fbf8f3";
  ctx.beginPath();
  ctx.arc(Math.min(mx, bar.x + bar.w - 10), my + bar.h / 2, 6, 0, Math.PI * 2);
  ctx.fill();
  my += 58;
  ctx.fillStyle = INK;
  ctx.font = `700 26px ${sans}`;
  ctx.fillText(`Color gap ${spec.gap.toFixed(1)} · ${spec.gapText}`, PAD, my);

  my += 52;
  ctx.font = `500 24px ${sans}`;
  for (const change of spec.changes.slice(0, 3)) {
    ctx.fillStyle = TONE_COLOR[change.tone];
    ctx.beginPath();
    ctx.arc(PAD + 9, my - 8, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(change.title, PAD + 30, my);
    my += 40;
  }

  ctx.fillStyle = MUTED;
  ctx.font = `400 20px ${sans}`;
  ctx.fillText("A forecast, not a guarantee. Always do the allergy and strand tests.", PAD, H - 56);
  ctx.textAlign = "right";
  ctx.fillStyle = ACCENT;
  ctx.font = `700 20px ${sans}`;
  ctx.fillText(window.location.host, W - PAD, H - 56);
  ctx.textAlign = "left";

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The card couldn't be created."))), "image/jpeg", 0.92),
  );
}

/** Opens the share sheet on phones (Save image / Photos), downloads on computers. */
export async function saveOrShare(blob: Blob, fileName: string, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], fileName, { type: blob.type });
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
