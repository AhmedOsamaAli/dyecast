import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { describeChange, gapMeaning } from "@/lib/engine/explain";
import { GAP_CLOSE, GAP_DIFFERENT } from "@/lib/engine/predict";
import type { Prediction } from "@/lib/engine/types";

const MAX = 30;

/** The color gap on a three-zone scale, in words people understand. */
export function GapMeter({ gap }: { gap: number }) {
  const { zone, text } = gapMeaning(gap);
  const at = Math.min(100, (gap / MAX) * 100);
  return (
    <div className={`gap-meter ${zone}`}>
      <div className="gap-meter-head">
        <span>Difference from the box</span>
        <strong>{text}</strong>
      </div>
      <div
        className="gap-track"
        role="meter"
        aria-label="Difference between the box and your likely result"
        aria-valuemin={0}
        aria-valuemax={MAX}
        aria-valuenow={Number(Math.min(gap, MAX).toFixed(1))}
        aria-valuetext={`${text} (color gap ${gap.toFixed(1)})`}
      >
        <span className="zone close" style={{ width: `${(GAP_CLOSE / MAX) * 100}%` }} />
        <span className="zone different" style={{ width: `${((GAP_DIFFERENT - GAP_CLOSE) / MAX) * 100}%` }} />
        <span className="zone very" />
        <span className="gap-marker" style={{ left: `${at}%` }} />
      </div>
      <div className="gap-scale" aria-hidden="true">
        <span>Looks the same</span>
        <span>Noticeable</span>
        <span>Obvious</span>
      </div>
      <p className="small muted">Color gap {gap.toFixed(1)} ΔE2000 — below 6 most people can&apos;t tell, above 12 it&apos;s obvious.</p>
    </div>
  );
}

const ICONS = { good: CircleCheck, warn: CircleAlert, bad: TriangleAlert };

/** Depth, tone and evenness compared with the box, with an icon for good / watch out / problem. */
export function ChangeList({ prediction }: { prediction: Prediction }) {
  return (
    <ul className="change-list">
      {describeChange(prediction).map((change) => {
        const Icon = ICONS[change.tone];
        return (
          <li key={change.id} className={`change ${change.tone}`}>
            <Icon size={18} aria-hidden="true" />
            <div>
              <strong>{change.title}</strong>
              <span>{change.detail}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
