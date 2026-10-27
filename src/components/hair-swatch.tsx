import { clamp, hexToLab, labToHex } from "@/lib/color";
import type { Streaks } from "@/lib/engine/types";

interface HairSwatchProps {
  /** Color of the lengths (most of the lock). */
  lengths: string;
  /** Optional different color at the roots (top of the lock). */
  roots?: string;
  /** Share of the lock taken by the roots color (0–1). */
  rootsShare?: number;
  /** Strands that look different (highlights or gray), drawn in proportion to their share. */
  streaks?: Streaks;
  /** Changes the strand layout so neighbouring swatches don't look identical. */
  seed?: number;
  label: string;
  className?: string;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, dL: number): string {
  const lab = hexToLab(hex);
  return labToHex({ L: clamp(lab.L + dL, 0, 100), a: lab.a, b: lab.b });
}

function idFor(...parts: Array<string | number | undefined>): string {
  let h = 2166136261;
  for (const ch of parts.join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return `hs${(h >>> 0).toString(36)}`;
}

const W = 200;
const H = 320;
const TOP = 26;

/** Outline of a loose lock of hair: bound at the top, fanning out, with an uneven tip. */
function lockPath(rand: () => number): string {
  const tips = Array.from({ length: 7 }, (_, i) => {
    const x = 30 + (i * 140) / 6;
    const y = H - 6 - rand() * 26;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M70,${TOP} C62,90 26,170 26,${H - 30} L ${tips.join(" L ")} L174,${H - 30} C174,170 138,90 130,${TOP} Z`;
}

/**
 * Visible strand groups: chunky highlight streaks (starting below new-growth roots) or fine,
 * salt-and-pepper gray hairs. Uses its own random stream so the base lock layout never changes.
 */
function streakStrands(streaks: Streaks, seed: number, rootsShare: number) {
  const rand = mulberry32(seed * 7919 + 101);
  const highlights = streaks.kind === "highlights";
  const count = highlights ? 40 : 90;
  const bottom = H - 8;
  const y0 = TOP + (bottom - TOP) * (highlights ? rootsShare : 0);
  const along = (y0 - TOP) / (bottom - TOP);
  const strands: Array<{ d: string; width: number; opacity: number }> = [];
  for (let i = 0; i < count; i++) {
    const t = (i + rand()) / count;
    const picked = rand() < streaks.share;
    const x0 = 72 + t * 56;
    const x1 = 30 + t * 140 + (rand() - 0.5) * 18;
    const cx = (x0 + x1) / 2 + (rand() - 0.5) * 20;
    const width = highlights ? 2.4 + rand() * 1.8 : 0.9 + rand() * 1.1;
    const opacity = highlights ? 0.85 : 0.75 + rand() * 0.2;
    if (!picked) continue;
    const xs = x0 + (x1 - x0) * along;
    strands.push({
      d: `M${xs.toFixed(1)},${y0.toFixed(1)} Q${cx.toFixed(1)},${((y0 + H) / 2).toFixed(1)} ${x1.toFixed(1)},${bottom}`,
      width,
      opacity,
    });
  }
  return strands;
}

/**
 * A realistic hair swatch rendered as deterministic SVG (no images, no client JS):
 * a base gradient (roots → lengths), lighter and darker strands for texture, a soft sheen band
 * and a salon-style binding. Two-zone results (e.g. hot roots) are visible at a glance.
 */
export function HairSwatch({ lengths, roots, rootsShare = 0.22, streaks, seed = 7, label, className }: HairSwatchProps) {
  const id = idFor(lengths, roots, rootsShare, seed);
  const rand = mulberry32(seed * 9973 + 17);
  const top = roots ?? lengths;
  const split = clamp(rootsShare, 0.05, 0.6);
  const outline = lockPath(rand);
  const extra = streaks && streaks.share > 0 ? streakStrands(streaks, seed, roots ? split : 0) : [];

  const strands = Array.from({ length: 64 }, (_, i) => {
    const t = i / 63;
    const x0 = 72 + t * 56 + (rand() - 0.5) * 6;
    const x1 = 30 + t * 140 + (rand() - 0.5) * 22;
    const cx = (x0 + x1) / 2 + (rand() - 0.5) * 24;
    const light = rand() > 0.55;
    return {
      d: `M${x0.toFixed(1)},${TOP} Q${cx.toFixed(1)},${(H * 0.5).toFixed(1)} ${x1.toFixed(1)},${H - 8}`,
      color: light ? "#ffffff" : "#000000",
      opacity: (light ? 0.06 : 0.1) + rand() * (light ? 0.12 : 0.16),
      width: 0.6 + rand() * 1.4,
    };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className={className} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`${id}-base`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(top, -4)} />
          <stop offset={Math.max(0, split - 0.06)} stopColor={top} />
          <stop offset={Math.min(1, split + 0.08)} stopColor={lengths} />
          <stop offset="1" stopColor={shade(lengths, 3)} />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.3" />
          <stop offset="0.25" stopColor="#000" stopOpacity="0" />
          <stop offset="0.75" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <path d={outline} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width={W} height={H} fill={`url(#${id}-base)`} />
        {strands.map((s, i) => (
          <path key={i} d={s.d} stroke={s.color} strokeOpacity={s.opacity} strokeWidth={s.width} fill="none" />
        ))}
        {streaks && extra.map((s, i) => (
          <path key={`streak-${i}`} d={s.d} stroke={streaks.hex} strokeOpacity={s.opacity} strokeWidth={s.width} strokeLinecap="round" fill="none" />
        ))}
        <rect x="0" y={H * 0.28} width={W} height={H * 0.2} fill={`url(#${id}-sheen)`} />
        <rect width={W} height={H} fill={`url(#${id}-edge)`} />
      </g>
      <rect x="62" y="6" width="76" height="26" rx="6" fill="#2f2a26" />
      <rect x="62" y="6" width="76" height="9" rx="4" fill="#fff" fillOpacity="0.12" />
    </svg>
  );
}
