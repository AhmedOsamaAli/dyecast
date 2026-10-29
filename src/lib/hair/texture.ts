import { clamp } from "@/lib/color";
import type { Streaks } from "@/lib/engine/types";

/**
 * Hair swatches are a real photograph of hair, recolored at display time. scripts/hair-photo.mjs turns the photo
 * into a grayscale shading map (average gray 0.5) plus aligned masks marking highlight sections and gray strands
 * that follow the photo's own strands. Each layer below is the photo recolored with a gradient map (./ramp.ts).
 */

/** Size of a swatch in drawing units (the textures are 800 × 1280, 4 pixels per unit). */
export const SWATCH_W = 200;
export const SWATCH_H = 320;

const VERSION = "v2";
export const HAIR_TEXTURE = `/hair/hair-${VERSION}.webp`;
/** A square crop of the same photo (average gray 0.5) for small color chips. */
export const CHIP_TEXTURE = `/hair/chip-${VERSION}.webp`;

const GRAY_MASKS = [0.15, 0.25, 0.5, 0.75];

export interface SwatchInput {
  /** Color of the lengths (most of the hair). */
  lengths: string;
  /** Optional different color at the roots (top of the swatch). */
  roots?: string;
  /** Share of the swatch's height taken by the roots color (0–1). */
  rootsShare?: number;
  /** Strands that look different (highlights or gray), in proportion to their share. */
  streaks?: Streaks;
  /** Varies the swatch (mirrored on odd seeds) so neighbouring swatches don't look identical. */
  seed?: number;
}

/** A vertical fade in drawing units: fully visible above `from`, gone below `to`. */
export interface Fade {
  from: number;
  to: number;
}

export interface SwatchLayer {
  /** The color this layer gives the hair (its gradient map's target). */
  hex: string;
  /** Limits the layer to the top of the swatch (new-growth roots). */
  roots?: Fade;
  /** Limits the layer to the strands in this mask texture. */
  strands?: string;
  /** Hides the layer where the roots show (highlights grow out below new roots). */
  belowRoots?: Fade;
}

/** The roots color blends into the lengths across a short band at the roots' share of the height. */
export function rootsFade(rootsShare = 0.22): Fade {
  const at = clamp(rootsShare, 0.05, 0.6) * SWATCH_H;
  return { from: at - 16, to: at + 22 };
}

/** How visible (0–1) a layer limited by `fade` is at height `y`; matches an SVG linear gradient mask. */
export function fadeAt(fade: Fade, y: number): number {
  return clamp((fade.to - y) / (fade.to - fade.from), 0, 1);
}

/** The strand mask for visible streaks: highlight sections, or the gray share closest to the requested one. */
export function streakMask(streaks: Pick<Streaks, "kind" | "share">): string {
  if (streaks.kind === "highlights") return `/hair/mask-highlights-${VERSION}.webp`;
  const share = GRAY_MASKS.reduce((best, s) => (Math.abs(s - streaks.share) <= Math.abs(best - streaks.share) + 1e-9 ? s : best));
  return `/hair/mask-gray${Math.round(share * 100)}-${VERSION}.webp`;
}

/** Layers to draw, bottom to top: the lengths, then the roots, then the visible streaks. */
export function swatchLayers({ lengths, roots, rootsShare, streaks }: SwatchInput): SwatchLayer[] {
  const fade = roots ? rootsFade(rootsShare) : undefined;
  const layers: SwatchLayer[] = [{ hex: lengths }];
  if (roots && fade) layers.push({ hex: roots, roots: fade });
  if (streaks && streaks.share > 0) {
    layers.push({ hex: streaks.hex, strands: streakMask(streaks), belowRoots: streaks.kind === "highlights" ? fade : undefined });
  }
  return layers;
}

/** Odd seeds show the photo mirrored. */
export function isMirrored(seed = 7): boolean {
  return Math.abs(Math.round(seed)) % 2 === 1;
}

/**
 * Which part of the photo a swatch shows when its box is wider than the photo: 0 = top, 0.5 = middle, 1 = bottom.
 * Varies with the seed so a grid of swatches doesn't repeat; swatches with roots always show the top.
 */
export function cropAlign({ roots, seed = 7 }: Pick<SwatchInput, "roots" | "seed">): 0 | 0.5 | 1 {
  if (roots) return 0;
  return ([0, 0.5, 1] as const)[Math.floor(Math.abs(Math.round(seed)) / 2) % 3];
}
