#!/usr/bin/env node
/**
 * Builds the hair texture behind every DyeCast swatch from a real photograph.
 *
 * Source photo: "Hair01.JPG" by Kefi, Wikimedia Commons, released into the public domain
 * (https://commons.wikimedia.org/wiki/File:Hair01.JPG). It is downloaded once into .cache/ (not committed).
 *
 * The photo becomes a grayscale shading map whose average gray is 0.5. Colors are applied at display time with a
 * gradient map (src/lib/hair/ramp.ts), so this one real photo shows every shade with real strands, clumps and shine.
 * Masks for highlights and gray hairs are traced along the photo's own strand directions, so they follow real strands.
 *
 * Usage: node scripts/hair-photo.mjs [--preview <sheet.png>]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Textures are served with an immutable cache header: bump this (and VERSION in src/lib/hair/texture.ts) on any change.
const VERSION = "v2";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "hair");
const SOURCE = {
  url: "https://upload.wikimedia.org/wikipedia/commons/e/e5/Hair01.JPG",
  file: join(ROOT, ".cache", "hair", "Hair01.jpg"),
  // A 5:8 crop (the swatch's shape) from the 1944 × 2592 photo.
  crop: { left: 162, top: 0, width: 1620, height: 2592 },
};

/** Texture size: 5:8 like the swatch (200 × 320 drawing units, 4 pixels per unit). */
const W = 800;
const H = 1280;
const N = W * H;

// ---------- small numeric helpers ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0x6a12026);
function gauss() {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** One box-blur pass (running sums), horizontal then vertical, with edge clamping. */
function boxBlur(src, rx, ry) {
  const tmp = new Float32Array(N);
  const out = new Float32Array(N);
  if (rx > 0) {
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let sum = 0;
      for (let x = -rx; x <= rx; x++) sum += src[row + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) {
        tmp[row + x] = sum / (2 * rx + 1);
        sum += src[row + Math.min(W - 1, x + rx + 1)] - src[row + Math.max(0, x - rx)];
      }
    }
  } else tmp.set(src);
  if (ry > 0) {
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let y = -ry; y <= ry; y++) sum += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) {
        out[y * W + x] = sum / (2 * ry + 1);
        sum += tmp[Math.min(H - 1, y + ry + 1) * W + x] - tmp[Math.max(0, y - ry) * W + x];
      }
    }
  } else out.set(tmp);
  return out;
}

/** Gaussian blur approximated by three box blurs (separate sigmas across and along). */
function blur(src, sx, sy = sx) {
  const radius = (s) => (s <= 0 ? 0 : Math.max(1, Math.round((Math.sqrt((12 * s * s) / 3 + 1) - 1) / 2)));
  const rx = radius(sx);
  const ry = radius(sy);
  let out = src;
  for (let i = 0; i < 3; i++) out = boxBlur(out, rx, ry);
  return out;
}

function stats(a) {
  let mean = 0;
  for (let i = 0; i < a.length; i++) mean += a[i];
  mean /= a.length;
  let v = 0;
  for (let i = 0; i < a.length; i++) v += (a[i] - mean) ** 2;
  return { mean, std: Math.sqrt(v / a.length) };
}
function quantile(a, q) {
  const sorted = Float32Array.from(a).sort();
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
}

// ---------- 1. the photo, as perceptual lightness ----------
if (!existsSync(SOURCE.file)) {
  mkdirSync(dirname(SOURCE.file), { recursive: true });
  const res = await fetch(SOURCE.url, { headers: { "User-Agent": "DyeCast/1.0 (hair texture build)" } });
  if (!res.ok) throw new Error(`Couldn't download the source photo: HTTP ${res.status}`);
  writeFileSync(SOURCE.file, Buffer.from(await res.arrayBuffer()));
}
const rgb = await sharp(readFileSync(SOURCE.file))
  .extract(SOURCE.crop)
  .resize(W, H, { kernel: "lanczos3" })
  .removeAlpha()
  .raw()
  .toBuffer();
const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const LIN = Float32Array.from({ length: 256 }, (_, c) => toLinear(c));
const lightness = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const y = 0.2126729 * LIN[rgb[i * 3]] + 0.7151522 * LIN[rgb[i * 3 + 1]] + 0.072175 * LIN[rgb[i * 3 + 2]];
  lightness[i] = (y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y) / 100;
}

// ---------- 2. flatten the photo's lighting, keep strands and fine clumps ----------
// Large-scale lighting goes almost entirely; mid-scale shadow pockets are softened so they don't read as blotches.
const lighting = blur(lightness, W * 0.3);
const lightingMean = stats(lighting).mean;
const clumps = blur(lightness, 10);
const pockets = blur(lightness, 110);
const flat = new Float32Array(N);
for (let i = 0; i < N; i++) {
  // Dark pockets (a clump darker than its surroundings) are mostly lifted; brighter clumps, the shine, mostly stay.
  const clump = clumps[i] - pockets[i];
  const midScale = clump < 0 ? 0.85 * clump : 0.35 * clump;
  flat[i] = lightness[i] - midScale - 0.8 * (pockets[i] - lighting[i]) - 0.8 * (lighting[i] - lightingMean);
}

// ---------- 3. normalize: the average becomes gray 0.5 (the gradient map's target color) ----------
const { mean } = stats(flat);
const lo = quantile(flat, 0.005);
const hi = quantile(flat, 0.997);
const gray = new Uint8ClampedArray(N);
for (let i = 0; i < N; i++) {
  const v = flat[i];
  const n = v <= mean ? 0.5 - (0.4 * (mean - v)) / (mean - lo) : 0.5 + (0.46 * (v - mean)) / (hi - mean);
  gray[i] = Math.round(clamp01(n) * 255);
}
console.log(`lightness: mean ${mean.toFixed(3)}, 0.5% ${lo.toFixed(3)}, 99.7% ${hi.toFixed(3)}`);

// ---------- 4. how the strands flow (structure tensor) ----------
const smooth = blur(lightness, 1.2);
const jxx = new Float32Array(N);
const jyy = new Float32Array(N);
const jxy = new Float32Array(N);
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const gx = smooth[i - W + 1] + 2 * smooth[i + 1] + smooth[i + W + 1] - smooth[i - W - 1] - 2 * smooth[i - 1] - smooth[i + W - 1];
    const gy = smooth[i + W - 1] + 2 * smooth[i + W] + smooth[i + W + 1] - smooth[i - W - 1] - 2 * smooth[i - W] - smooth[i - W + 1];
    jxx[i] = gx * gx;
    jyy[i] = gy * gy;
    jxy[i] = gx * gy;
  }
}
/** Unit strand directions (pointing down the hair), from the tensor smoothed at `scale` pixels. */
function flowField(scale) {
  const [sxx, syy, sxy] = [jxx, jyy, jxy].map((j) => blur(j, scale));
  const dx = new Float32Array(N);
  const dy = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // Strands run across the strongest change in brightness.
    const theta = 0.5 * Math.atan2(2 * sxy[i], sxx[i] - syy[i]) + Math.PI / 2;
    const flip = Math.sin(theta) < 0 ? -1 : 1;
    dx[i] = Math.cos(theta) * flip;
    dy[i] = Math.sin(theta) * flip;
  }
  return { dx, dy };
}
const fineFlow = flowField(6);
const broadFlow = flowField(24);

/**
 * Which strand each pixel shows: the x where that strand enters at the top, carried down row by row along the
 * broad flow. Highlight sections are bands of this coordinate, so they run the whole length of the hair.
 */
const across = new Float32Array(N);
for (let x = 0; x < W; x++) across[x] = x;
for (let y = 1; y < H; y++) {
  const row = y * W;
  const prev = row - W;
  const at = (x) => (x < 0 ? across[prev] + x : x > W - 1 ? across[prev + W - 1] + x - (W - 1) : across[prev + x]);
  for (let x = 0; x < W; x++) {
    const i = row + x;
    const slope = Math.max(-1.5, Math.min(1.5, broadFlow.dx[i] / Math.max(broadFlow.dy[i], 0.3)));
    const from = x - slope;
    const x0 = Math.floor(from);
    across[i] = at(x0) + (at(x0 + 1) - at(x0)) * (from - x0);
  }
}

/** Strands are traced this far past the image, so their tapered ends fall outside and edges stay as dense as the middle. */
const MARGIN = 90;

/** Follows one strand from (x, y) along the photo's own strands, in one direction (+1 down, -1 up). */
function trace(x, y, sign, length) {
  const points = [];
  let pdx = 0;
  let pdy = sign;
  let bend = 0;
  for (let s = 0; s < length; s += 0.5) {
    const i = Math.min(H - 1, Math.max(0, y | 0)) * W + Math.min(W - 1, Math.max(0, x | 0));
    let dx = fineFlow.dx[i];
    let dy = fineFlow.dy[i];
    if (dx * pdx + dy * pdy < 0) {
      dx = -dx;
      dy = -dy;
    }
    // A slow wobble of its own keeps strands from collapsing onto the same path.
    bend = Math.max(-0.07, Math.min(0.07, bend + gauss() * 0.004));
    const c = Math.cos(bend);
    const sn = Math.sin(bend);
    [dx, dy] = [dx * c - dy * sn, dx * sn + dy * c];
    x += dx * 0.5;
    y += dy * 0.5;
    if (x < -MARGIN || y < -MARGIN || x > W + MARGIN || y > H + MARGIN) break;
    points.push(x, y);
    pdx = dx;
    pdy = dy;
  }
  return points;
}

/** A whole strand through (x, y): up and down from the seed, as a flat [x0, y0, x1, y1, …] list. */
function strandThrough(x, y, length) {
  const up = trace(x, y, -1, length * (0.3 + 0.4 * rand()));
  const down = trace(x, y, 1, length);
  const points = [];
  for (let k = up.length - 2; k >= 0; k -= 2) points.push(up[k], up[k + 1]);
  points.push(x, y, ...down);
  return points;
}

/** Union of anti-aliased strands, each with its own width and visibility along its length. */
class StrandMask {
  constructor() {
    this.mask = new Float32Array(N);
    this.stamp = new Int32Array(N).fill(-1);
    this.cov = new Float32Array(N);
    this.touched = [];
    this.id = 0;
    this.sum = 0;
  }
  get coverage() {
    return this.sum / N;
  }
  draw(points, { halfWidth, opacity, dips }) {
    const n = points.length / 2;
    const taper = Math.min(60, n * 0.25);
    const phase = [rand(), rand()];
    const period = [180 + rand() * 260, 70 + rand() * 90];
    for (let k = 0; k < n; k++) {
      const s = k * 0.5;
      const ends = smoothstep(0, taper, k) * smoothstep(0, taper, n - 1 - k);
      // A strand dips under its neighbours now and then, and resurfaces.
      const showing = dips ? clamp01(0.6 + 0.45 * Math.sin(2 * Math.PI * (s / period[0] + phase[0])) + 0.25 * Math.sin(2 * Math.PI * (s / period[1] + phase[1]))) : 1;
      const a = opacity * ends * (dips ? 0.3 + 0.7 * showing : 1);
      if (a <= 0.01) continue;
      this.splat(points[2 * k], points[2 * k + 1], halfWidth * (0.55 + 0.45 * ends), a);
    }
    for (const i of this.touched) {
      const before = this.mask[i];
      this.mask[i] = 1 - (1 - before) * (1 - this.cov[i]);
      this.sum += this.mask[i] - before;
    }
    this.touched.length = 0;
    this.id++;
  }
  splat(x, y, hw, a) {
    const r = hw + 1;
    const x0 = Math.max(0, Math.floor(x - r));
    const x1 = Math.min(W - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r));
    const y1 = Math.min(H - 1, Math.ceil(y + r));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const c = Math.min(1, hw + 0.5 - Math.hypot(px + 0.5 - x, py + 0.5 - y)) * a;
        if (c <= 0) continue;
        const i = py * W + px;
        if (this.stamp[i] !== this.id) {
          this.stamp[i] = this.id;
          this.cov[i] = c;
          this.touched.push(i);
        } else if (c > this.cov[i]) this.cov[i] = c;
      }
    }
  }
}

const t0 = Date.now();

// Gray hairs: single fine strands scattered through the hair. Masks are nested: more gray adds more strands.
const GRAY_SHARES = [0.15, 0.25, 0.5, 0.75];
const grayMasks = [];
const grayHairs = new StrandMask();
while (grayMasks.length < GRAY_SHARES.length) {
  const points = strandThrough(-MARGIN / 2 + rand() * (W + MARGIN), -MARGIN + rand() * (H + 2 * MARGIN), 260 + rand() * 520);
  grayHairs.draw(points, { halfWidth: 0.55 + rand() * 0.45, opacity: 0.7 + rand() * 0.3, dips: true });
  while (grayMasks.length < GRAY_SHARES.length && grayHairs.coverage >= GRAY_SHARES[grayMasks.length]) grayMasks.push(Float32Array.from(grayHairs.mask));
}

// Foil highlights: woven sections 18–46 px wide with 30–84 px gaps, each made of many strands, densest in the middle
// and thinning out at the edges like a real woven foil.
const highlights = new Float32Array(N);
const rowOf = (y) => across.subarray(y * W, (y + 1) * W);
function xForStrand(u, y) {
  const row = rowOf(y);
  let best = 0;
  for (let x = 1; x < W; x++) if (Math.abs(row[x] - u) < Math.abs(row[best] - u)) best = x;
  return Math.abs(row[best] - u) < 3 ? best + rand() - 0.5 : null;
}
for (let u = -40 + rand() * 40; u < W + 40; ) {
  const width = 18 + rand() * 28;
  const strength = 0.8 + rand() * 0.2;
  const section = new StrandMask();
  const strands = Math.round(width * 5);
  for (let k = 0; k < strands; k++) {
    // Triangular spread across the section, plus a few strands that stray past its edge.
    const spread = rand() < 0.1 ? (rand() - 0.5) * 2.6 : rand() + rand() - 1;
    const y = Math.floor(rand() * H);
    const x = xForStrand(u + width / 2 + spread * (width / 2), y);
    if (x === null) continue;
    section.draw(strandThrough(x, y, 300 + rand() * 500), { halfWidth: 0.6 + rand() * 0.5, opacity: 0.75 + rand() * 0.25, dips: false });
  }
  for (let i = 0; i < N; i++) highlights[i] = Math.max(highlights[i], section.mask[i] * strength);
  u += width + 30 + rand() * 54;
}
console.log(`traced strands in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const MASKS = [
  { file: "mask-highlights", mask: highlights },
  ...GRAY_SHARES.map((share, k) => ({ file: `mask-gray${Math.round(share * 100)}`, mask: grayMasks[k] })),
];
for (const { file, mask } of MASKS) console.log(`${file}: covers ${(100 * stats(mask).mean).toFixed(0)}%`);

// ---------- 5. write textures ----------
mkdirSync(OUT, { recursive: true });
const grayImage = (values, width, height) => {
  const bytes = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) bytes[i * 3] = bytes[i * 3 + 1] = bytes[i * 3 + 2] = values[i];
  return sharp(bytes, { raw: { width, height, channels: 3 } });
};
await grayImage(gray, W, H).webp({ quality: 76, effort: 6 }).toFile(join(OUT, `hair-${VERSION}.webp`));
for (const { file, mask } of MASKS) {
  const bytes = Uint8ClampedArray.from(mask, (m) => Math.round(m * 255));
  await grayImage(bytes, W, H).webp({ quality: 70, effort: 6 }).toFile(join(OUT, `${file}-${VERSION}.webp`));
}
// An opaque square from the middle for small color chips, re-centered on gray 0.5 so a chip keeps its color.
const CHIP = { left: 272, top: 420, size: 256 };
const chipGray = [];
for (let y = 0; y < CHIP.size; y++) {
  for (let x = 0; x < CHIP.size; x++) chipGray.push(gray[(CHIP.top + y) * W + CHIP.left + x] / 255);
}
const chipMean = chipGray.reduce((sum, g) => sum + g, 0) / chipGray.length;
const chip = chipGray.map((g) => Math.round(255 * (g <= chipMean ? (0.5 * g) / chipMean : 0.5 + (0.5 * (g - chipMean)) / (1 - chipMean))));
await grayImage(chip, CHIP.size, CHIP.size).webp({ quality: 82, effort: 6 }).toFile(join(OUT, `chip-${VERSION}.webp`));
console.log(`wrote ${OUT}`);

// ---------- optional preview sheet ----------
// Mirrors the app's gradient map (src/lib/hair/ramp.ts) closely enough to judge the texture by eye.
function linearToLab(lin) {
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124564 * lin[0] + 0.3575761 * lin[1] + 0.1804375 * lin[2]) / 0.95047);
  const y = f(0.2126729 * lin[0] + 0.7151522 * lin[1] + 0.072175 * lin[2]);
  const z = f((0.0193339 * lin[0] + 0.119192 * lin[1] + 0.9503041 * lin[2]) / 1.08883);
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}
function hexToLab(hex) {
  const n = parseInt(hex.slice(1), 16);
  return linearToLab([(n >> 16) & 255, (n >> 8) & 255, n & 255].map(toLinear));
}
function labToRgb({ L, a, b }) {
  const fy = (L + 16) / 116;
  const inv = (t) => (t > 0.206893 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = 0.95047 * inv(fy + a / 500);
  const Y = inv(fy);
  const Z = 1.08883 * inv(fy - b / 200);
  return [
    3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
    0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  ].map((c) => 255 * clamp01(c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
}
function rampLab(t, g) {
  const C = Math.hypot(t.a, t.b);
  const h = Math.atan2(t.b, t.a);
  let L;
  let c;
  if (g <= 0.5) {
    const k = g / 0.5;
    const floor = 0.28 + 0.32 * (t.L / 100);
    L = t.L * (floor + (1 - floor) * k ** 1.1);
    c = C * (0.8 + 0.2 * k);
  } else {
    const k = (g - 0.5) / 0.5;
    const top = Math.min(98, t.L + 26 + 16 * (1 - t.L / 100));
    L = t.L + (top - t.L) * k ** 1.6;
    c = C * (1 - 0.6 * k ** 1.4);
  }
  return { L, a: c * Math.cos(h), b: c * Math.sin(h) };
}
function rampLut(hex) {
  const t = hexToLab(hex);
  const stops = Array.from({ length: 11 }, (_, i) => labToRgb(rampLab(t, i / 10)));
  const lut = new Float32Array(256 * 3);
  for (let v = 0; v < 256; v++) {
    const x = (v / 255) * 10;
    const i = Math.min(9, Math.floor(x));
    const f = x - i;
    for (let ch = 0; ch < 3; ch++) lut[v * 3 + ch] = stops[i][ch] + (stops[i + 1][ch] - stops[i][ch]) * f;
  }
  return lut;
}

const previewIndex = process.argv.indexOf("--preview");
if (previewIndex > 0) {
  const target = process.argv[previewIndex + 1];
  const tile = { w: 200, h: 320 };
  const cases = [
    { label: "Soft black", lengths: "#1f1814" },
    { label: "Dark brown", lengths: "#4e3c30" },
    { label: "Light brown", lengths: "#785e48" },
    { label: "Copper", lengths: "#a96b3b" },
    { label: "Golden blonde", lengths: "#ae8e61" },
    { label: "Ash blonde", lengths: "#b8ad99" },
    { label: "Platinum", lengths: "#d7c6b8" },
    { label: "Hot roots", lengths: "#4e3326", roots: "#82492c" },
    { label: "Highlights", lengths: "#624c3b", streak: { hex: "#af8d67", mask: 0 } },
    { label: "Half gray", lengths: "#785e48", streak: { hex: "#d2cbc1", mask: 3 } },
    { label: "Some gray", lengths: "#3d2f26", streak: { hex: "#cfc8bd", mask: 1 } },
    { label: "Mostly gray", lengths: "#4e3c30", streak: { hex: "#d2cbc1", mask: 4 } },
  ];
  const tiles = [];
  for (const cse of cases) {
    const lut = rampLut(cse.lengths);
    const rootLut = cse.roots ? rampLut(cse.roots) : null;
    const streakLut = cse.streak ? rampLut(cse.streak.hex) : null;
    const out = Buffer.alloc(N * 3);
    const sum = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      const g = gray[i];
      const px = [lut[g * 3], lut[g * 3 + 1], lut[g * 3 + 2]];
      const y = Math.floor(i / W) / H;
      const rootsWeight = 1 - smoothstep(0.17, 0.29, y);
      if (rootLut) for (let ch = 0; ch < 3; ch++) px[ch] += (rootLut[g * 3 + ch] - px[ch]) * rootsWeight;
      if (streakLut) {
        const m = MASKS[cse.streak.mask].mask[i] * (cse.streak.mask === 0 && rootLut ? 1 - rootsWeight : 1);
        for (let ch = 0; ch < 3; ch++) px[ch] += (streakLut[g * 3 + ch] - px[ch]) * m;
      }
      for (let ch = 0; ch < 3; ch++) {
        out[i * 3 + ch] = px[ch];
        sum[ch] += toLinear(px[ch]);
      }
    }
    if (!rootLut && !streakLut) {
      const seen = linearToLab(sum.map((s) => s / N));
      const want = hexToLab(cse.lengths);
      const dE = Math.hypot(seen.L - want.L, seen.a - want.a, seen.b - want.b);
      console.log(`${cse.label.padEnd(14)} target L ${want.L.toFixed(1)} → average L ${seen.L.toFixed(1)}, ΔE76 ${dE.toFixed(1)}`);
    }
    const small = await sharp(out, { raw: { width: W, height: H, channels: 3 } }).resize(tile.w, tile.h).png().toBuffer();
    const label = Buffer.from(`<svg width="${tile.w}" height="24"><text x="6" y="17" font-family="Arial" font-size="14" fill="#333">${cse.label}</text></svg>`);
    tiles.push({ small, label, full: out });
  }
  const cols = 5;
  const rows = Math.ceil(tiles.length / cols);
  const gap = 8;
  await sharp({ create: { width: cols * (tile.w + gap), height: rows * (tile.h + 24 + gap), channels: 3, background: "#ebeae7" } })
    .composite(
      tiles.flatMap((t, i) => [
        { input: t.label, left: (i % cols) * (tile.w + gap), top: Math.floor(i / cols) * (tile.h + 24 + gap) },
        { input: t.small, left: (i % cols) * (tile.w + gap), top: Math.floor(i / cols) * (tile.h + 24 + gap) + 24 },
      ]),
    )
    .png()
    .toFile(target);
  // Full-resolution crops to judge strand detail: light brown, and the highlights case.
  await sharp(tiles[2].full, { raw: { width: W, height: H, channels: 3 } })
    .extract({ left: 160, top: 300, width: 480, height: 480 })
    .png()
    .toFile(target.replace(/\.png$/, "-detail.png"));
  await sharp(tiles[8].full, { raw: { width: W, height: H, channels: 3 } })
    .extract({ left: 160, top: 300, width: 480, height: 480 })
    .png()
    .toFile(target.replace(/\.png$/, "-highlights.png"));
  await sharp(tiles[11].full, { raw: { width: W, height: H, channels: 3 } })
    .extract({ left: 160, top: 300, width: 480, height: 480 })
    .png()
    .toFile(target.replace(/\.png$/, "-gray.png"));
  console.log(`preview: ${target}`);
}
