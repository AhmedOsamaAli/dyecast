/**
 * Color science utilities (sRGB, CIE XYZ D65, CIELAB, LCh, CIEDE2000).
 * Pure functions with no dependencies so they run identically on server, client and in tests.
 */

export type RGB = { r: number; g: number; b: number }; // 0–255
export type Lab = { L: number; a: number; b: number };
export type LCh = { L: number; C: number; h: number }; // h in degrees [0, 360)

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX_RE.test(value.trim());
}

export function hexToRgb(hex: string): RGB {
  const match = HEX_RE.exec(hex.trim());
  if (!match) throw new Error(`Invalid hex color: ${hex}`);
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const to = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const c = clamp(channel, 0, 1);
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return v * 255;
}

// D65 reference white.
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;
const EPS = (6 / 29) ** 3;
const KAPPA = 3 * (6 / 29) ** 2;

function f(t: number): number {
  return t > EPS ? Math.cbrt(t) : t / KAPPA + 4 / 29;
}

function fInv(t: number): number {
  return t > 6 / 29 ? t ** 3 : KAPPA * (t - 4 / 29);
}

export function rgbToLab(rgb: RGB): Lab {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  const fx = f(x / XN);
  const fy = f(y / YN);
  const fz = f(z / ZN);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToRgb(lab: Lab): RGB {
  const fy = (lab.L + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;
  const x = XN * fInv(fx);
  const y = YN * fInv(fy);
  const z = ZN * fInv(fz);
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) };
}

export function hexToLab(hex: string): Lab {
  return rgbToLab(hexToRgb(hex));
}

export function labToHex(lab: Lab): string {
  return rgbToHex(labToRgb(lab));
}

export function labToLch({ L, a, b }: Lab): LCh {
  return { L, C: Math.hypot(a, b), h: hueDegrees(b, a) };
}

export function lchToLab({ L, C, h }: LCh): Lab {
  const r = (h * Math.PI) / 180;
  return { L, a: C * Math.cos(r), b: C * Math.sin(r) };
}

/** Linear interpolation in CIELAB (t = 0 → a, t = 1 → b). */
export function mixLab(a: Lab, b: Lab, t: number): Lab {
  const k = clamp(t, 0, 1);
  return { L: a.L + (b.L - a.L) * k, a: a.a + (b.a - a.a) * k, b: a.b + (b.b - a.b) * k };
}

/** Scales chroma toward neutral while keeping lightness and hue (factor 0 → grey, 1 → unchanged). */
export function scaleChroma(lab: Lab, factor: number): Lab {
  return { L: lab.L, a: lab.a * factor, b: lab.b * factor };
}

function hueDegrees(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const h = (Math.atan2(y, x) * 180) / Math.PI;
  return h < 0 ? h + 360 : h;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * CIEDE2000 color difference (Sharma, Wu & Dalal, 2005).
 * ~1 is a just-noticeable difference under ideal conditions; hair comparisons use wider bands.
 */
export function deltaE2000(lab1: Lab, lab2: Lab, kL = 1, kC = 1, kH = 1): number {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = hueDegrees(b1, a1p);
  const h2p = hueDegrees(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp: number;
  if (C1p * C2p === 0) hbarp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
  else hbarp = (h1p + h2p - 360) / 2;

  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.2 * Math.cos(rad(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(rad(2 * dTheta)) * RC;

  const tL = dLp / (kL * SL);
  const tC = dCp / (kC * SC);
  const tH = dHp / (kH * SH);
  return Math.sqrt(tL * tL + tC * tC + tH * tH + RT * tC * tH);
}

export function deltaE2000Hex(hex1: string, hex2: string): number {
  return deltaE2000(hexToLab(hex1), hexToLab(hex2));
}

/** Picks black or white text for legibility on top of a swatch. */
export function readableTextColor(hex: string): "#000000" | "#ffffff" {
  return hexToLab(hex).L > 60 ? "#000000" : "#ffffff";
}
