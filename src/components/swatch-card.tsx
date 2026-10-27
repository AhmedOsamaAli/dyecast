import { HairSwatch } from "@/components/hair-swatch";
import type { Streaks } from "@/lib/engine/types";

/** A labeled hair swatch card used across the landing page, examples and results. */
export function SwatchCard({ label, lengths, roots, streaks, description, variant = "", seed = 5 }: {
  label: string;
  lengths: string;
  roots?: string;
  streaks?: Streaks;
  description: string;
  variant?: string;
  seed?: number;
}) {
  return (
    <div className={`color-card ${variant}`}>
      <div className="color-surface">
        <HairSwatch lengths={lengths} roots={roots} streaks={streaks} label={`${label}: ${description}`} seed={seed} />
        <span className="color-code">{(roots && roots !== lengths ? `${roots} → ${lengths}` : lengths).toUpperCase()}</span>
      </div>
      <div className="color-caption">
        <p className="eyebrow">{label}</p>
        <strong>{description}</strong>
      </div>
    </div>
  );
}
