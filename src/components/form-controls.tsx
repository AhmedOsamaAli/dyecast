"use client";

import { labToHex } from "@/lib/color";
import { levelName } from "@/lib/engine/levels";
import { describedHairLab } from "@/lib/engine/predict";
import type { HairTone } from "@/lib/engine/types";
import { CHIP_TEXTURE } from "@/lib/hair/texture";

export function SelectField<T extends string>({ name, label, value, choices, labels = {}, onChange, error, hint }: {
  name: string;
  label: string;
  value: T;
  choices: readonly T[];
  labels?: Partial<Record<T, string>>;
  onChange: (value: T) => void;
  error?: string[];
  hint?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select
        id={name}
        name={name}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
        onChange={(event) => {
          const selected = choices.find((choice) => choice === event.target.value);
          if (selected !== undefined) onChange(selected);
        }}
      >
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {labels[choice] ?? choice.charAt(0).toUpperCase() + choice.slice(1)}
          </option>
        ))}
      </select>
      {hint && !error && <small className="muted" id={`${name}-hint`}>{hint}</small>}
      {error && <small className="field-error" id={`${name}-error`}>{error.join(" ")}</small>}
    </div>
  );
}

/** Level picker shown as realistic hair-colored swatches, with a half-step slider for fine tuning. */
export function LevelPicker({ name, label, value, tone = "neutral", onChange, error, suggested }: {
  name: string;
  label: string;
  value: number;
  tone?: HairTone;
  onChange: (value: number) => void;
  error?: string[];
  /** Level suggested by the photo, highlighted for the user to confirm. */
  suggested?: number;
}) {
  return (
    <div className="field level-picker">
      <label htmlFor={name}>
        {label} <span className="level-value">Level {value} · {levelName(value)}{suggested !== undefined && <span className="level-suggested"> · photo suggests {Math.round(suggested)}</span>}</span>
      </label>
      <div className="level-swatches" role="group" aria-label={`${label} swatches`}>
        {Array.from({ length: 10 }, (_, index) => index + 1).map((level) => (
          <button
            key={level}
            type="button"
            className={`${Math.round(value) === level ? "selected" : ""} ${suggested !== undefined && Math.round(suggested) === level ? "suggested" : ""}`}
            style={{ backgroundColor: labToHex(describedHairLab(level, tone)), backgroundImage: `url(${CHIP_TEXTURE})`, color: level < 7 ? "#fff" : "#241c16" }}
            onClick={() => onChange(level)}
            aria-label={`Level ${level}: ${levelName(level)}${suggested !== undefined && Math.round(suggested) === level ? " (suggested by your photo)" : ""}`}
            aria-pressed={value === level}
          >
            {level}
          </button>
        ))}
      </div>
      <input
        id={name}
        name={name}
        type="range"
        min="1"
        max="10"
        step="0.5"
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {error && <small className="field-error" id={`${name}-error`}>{error.join(" ")}</small>}
    </div>
  );
}

export const TONE_LABELS: Record<HairTone, string> = {
  neutral: "Neutral / balanced",
  warm: "Warm / golden",
  cool: "Cool / ashy",
  red: "Red / copper",
};
