import { labToHex } from "@/lib/color";
import { describedHairLab, GRAY_FRACTION, HIGHLIGHT_SHARE, highlightLevel, UNPIGMENTED } from "./predict";
import type { HairProfileInput, Prediction, Streaks } from "./types";

/** Colors for drawing one hair swatch: lengths, optional different roots, optional visible strands. */
export interface SwatchColors {
  lengths: string;
  roots?: string;
  streaks?: Streaks;
}

type DescribedHair = Pick<HairProfileInput, "lengthsLevel" | "naturalLevel" | "currentTone" | "naturalTone" | "history" | "gray">;

/** Hair as the person described it today, including visible highlights or gray strands. */
export function todaySwatch(hair: DescribedHair): SwatchColors {
  const lengths = labToHex(describedHairLab(hair.lengthsLevel, hair.currentTone));
  const natural = labToHex(describedHairLab(hair.naturalLevel, hair.naturalTone ?? "neutral"));
  const grayShare = GRAY_FRACTION[hair.gray];
  const gray = (share: number): Streaks | undefined =>
    share >= 0.1 ? { kind: "gray", hex: labToHex(UNPIGMENTED), share } : undefined;

  switch (hair.history) {
    case "virgin":
      return { lengths, streaks: gray(grayShare) };
    case "highlighted":
      // The lengths level describes the overall look; underneath are natural strands plus lighter highlights.
      return {
        lengths: natural,
        streaks: { kind: "highlights", hex: labToHex(describedHairLab(highlightLevel(hair), "warm")), share: HIGHLIGHT_SHARE },
      };
    default:
      // Colored lengths had most of their gray covered; natural roots show the regrowth.
      return { lengths, roots: natural, streaks: gray(grayShare * 0.3) };
  }
}

/** The predicted result, drawn with its roots and any strands that stay visibly different. */
export function resultSwatch(p: Prediction): SwatchColors {
  return {
    lengths: p.streaks?.baseHex ?? p.lengths.hex,
    roots: p.twoZone ? p.roots.hex : undefined,
    streaks: p.streaks ? { kind: p.streaks.kind, hex: p.streaks.hex, share: p.streaks.share } : undefined,
  };
}
