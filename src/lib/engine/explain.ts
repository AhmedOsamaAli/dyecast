import { roundLevel } from "./levels";
import { GAP_CLOSE, GAP_DIFFERENT, warmthDelta } from "./predict";
import type { Prediction } from "./types";

export type ChangeTone = "good" | "warn" | "bad";

export interface ChangeItem {
  id: "depth" | "tone" | "evenness";
  tone: ChangeTone;
  title: string;
  detail: string;
}

export type GapZone = "close" | "different" | "very-different";

/** What a color gap (ΔE2000) means to the eye. */
export function gapMeaning(gap: number): { zone: GapZone; text: string } {
  if (gap < GAP_CLOSE) return { zone: "close", text: "Looks like the box" };
  if (gap < GAP_DIFFERENT) return { zone: "different", text: "You'd notice the difference" };
  return { zone: "very-different", text: "Anyone would see the difference" };
}

function levels(n: number): string {
  return `${n} level${n === 1 ? "" : "s"}`;
}

/** Plain-language differences between the box promise and the likely result: depth, tone and evenness. */
export function describeChange(p: Prediction): ChangeItem[] {
  const items: ChangeItem[] = [];

  const delta = roundLevel(p.lengths.level - p.promise.level);
  const n = Math.abs(delta);
  const likely = roundLevel(p.lengths.level);
  if (delta <= -0.5) {
    items.push({
      id: "depth",
      tone: n >= 2 ? "bad" : "warn",
      title: `${levels(n)} darker than the box`,
      detail: `Likely about level ${likely}; the box shows level ${p.promise.level}.`,
    });
  } else if (delta >= 0.5) {
    items.push({
      id: "depth",
      tone: n >= 2 ? "bad" : "warn",
      title: `${levels(n)} lighter than the box`,
      detail: `Likely about level ${likely}; the box shows level ${p.promise.level}.`,
    });
  } else {
    items.push({ id: "depth", tone: "good", title: "Same depth as the box", detail: `About level ${likely}, like the box.` });
  }

  const warm = warmthDelta(p.lengths.lab, p.promise.lab);
  if (p.flags.includes("muddy")) {
    items.push({ id: "tone", tone: "bad", title: "Flat or greenish", detail: "Without a warm base underneath, this shade can look murky." });
  } else if (warm > 12) {
    items.push({ id: "tone", tone: "bad", title: "Much warmer: brassy orange", detail: "Exposed warm pigment overpowers the box's tone." });
  } else if (warm > 5) {
    items.push({ id: "tone", tone: "warn", title: "Warmer than the box", detail: "Expect more gold or orange than the box shows." });
  } else if (warm < -5) {
    items.push({ id: "tone", tone: "warn", title: "Cooler or duller than the box", detail: "Expect less warmth and shine than the box shows." });
  } else {
    items.push({ id: "tone", tone: "good", title: "Tone close to the box", detail: "The box's tone should show on your hair." });
  }

  if (p.twoZone) {
    const rootsLighter = p.roots.lab.L > p.lengths.lab.L;
    items.push({
      id: "evenness",
      tone: "bad",
      title: rootsLighter ? "Roots lighter than lengths" : "Roots and lengths differ",
      detail: rootsLighter
        ? `Roots about level ${roundLevel(p.roots.level)}, lengths about level ${roundLevel(p.lengths.level)}.`
        : "Your roots and lengths will take the color differently.",
    });
  } else if (p.streaks?.kind === "highlights") {
    items.push({ id: "evenness", tone: "bad", title: "Highlights stay as stripes", detail: "Highlighted strands take the dye differently from the rest." });
  } else if (p.streaks?.kind === "gray") {
    items.push({ id: "evenness", tone: "warn", title: "Grays stay brighter", detail: "Gray strands blend in like soft highlights instead of matching." });
  } else if (p.flags.includes("uneven-ends")) {
    items.push({ id: "evenness", tone: "warn", title: "Ends may come out darker", detail: "Porous ends grab extra color; strand test the ends." });
  } else {
    items.push({ id: "evenness", tone: "good", title: "Even from roots to ends", detail: "No two-tone or striped effect expected." });
  }

  return items;
}
