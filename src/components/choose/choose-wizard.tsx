"use client";

import Link from "next/link";
import { ArrowRight, Check, CircleAlert } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { rankGoals, type ChoosePrefs, type ColorPick, type GoalReach, type Undertone } from "@/lib/engine/recommend";
import type { GrayShare } from "@/lib/engine/types";
import { HairSwatch } from "@/components/hair-swatch";
import { ComparePreview } from "@/components/choose/compare-preview";

interface Option<T extends string> {
  value: T;
  label: string;
  hint: string;
}

const BOLDNESS: Option<ChoosePrefs["boldness"]>[] = [
  { value: "subtle", label: "A refresh", hint: "Close to my color, just richer" },
  { value: "noticeable", label: "Noticeable", hint: "People will see the change" },
  { value: "bold", label: "Bold", hint: "A whole new look" },
];
const UPKEEP: Option<ChoosePrefs["upkeep"]>[] = [
  { value: "low", label: "Low", hint: "Let it grow out softly" },
  { value: "medium", label: "Some", hint: "Root touch-ups every 6–8 weeks" },
  { value: "high", label: "Happy to keep it up", hint: "Toning and glosses are fine" },
];
const UNDERTONE: Option<Undertone>[] = [
  { value: "warm", label: "Warm", hint: "Gold jewelry looks best" },
  { value: "neutral", label: "Neutral", hint: "Both look good, or not sure" },
  { value: "cool", label: "Cool", hint: "Silver jewelry looks best" },
];

const RANK = ["Best fit", "Runner-up", "Also great"];
const ROUTE_LABEL: Record<ColorPick["route"], string> = { "one-box": "One box", "box-and-toner": "Box + toner", colorist: "Colorist" };

function routeText(pick: ColorPick): string {
  if (pick.route === "colorist") return "Lightening, then a toner";
  return pick.steps.map((s) => `${s.role === "toner" ? "toner" : "box"} ${s.code}`).join(" + ");
}

function Question<T extends string>({ title, name, options, value, onChange, note }: {
  title: string;
  name: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  note?: ReactNode;
}) {
  return (
    <fieldset className="choose-question">
      <legend>{title}</legend>
      <div className="choice-row">
        {options.map((o) => (
          <label key={o.value} className={`choice ${value === o.value ? "selected" : ""}`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <strong>{o.label}</strong>
            <small>{o.hint}</small>
          </label>
        ))}
      </div>
      {note && <p className="small muted choose-note">{note}</p>}
    </fieldset>
  );
}

function PickCard({ pick, rank, seed }: { pick: ColorPick; rank: string; seed: number }) {
  const colorist = pick.route === "colorist";
  return (
    <article className={`pick-card ${colorist ? "colorist" : ""}`}>
      <div className="pick-visual color-surface">
        <HairSwatch
          lengths={pick.likelyHex}
          label={`${pick.goal.name}: ${colorist ? "the salon result" : "the likely result on your hair"}`}
          seed={seed}
        />
        <span className="pick-rank">{rank}</span>
      </div>
      <div className="pick-body">
        <h3>{pick.goal.name}</h3>
        <p className="pick-route">
          <span className={`route-badge ${pick.route}`}>{ROUTE_LABEL[pick.route]}</span> {routeText(pick)}
        </p>
        <ul className="pick-points">
          {pick.reasons.map((r) => <li key={r} className="good"><Check size={15} aria-hidden="true" /> {r}</li>)}
          {pick.cautions.map((c) => <li key={c} className="warn"><CircleAlert size={15} aria-hidden="true" /> {c}</li>)}
        </ul>
        <Link href={`/check?mode=goal&goal=${pick.goal.id}`} className="button">
          Check it on my hair <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

/** "Help me choose": three questions, re-ranked live, with the best fits worked out on this person's hair. */
export function ChooseWizard({ reach, gray, skin }: {
  reach: GoalReach[];
  gray: GrayShare;
  /** Skin color from the selfie analysis, with the undertone it suggests. */
  skin?: { hex: string; undertone: Undertone };
}) {
  const [prefs, setPrefs] = useState<ChoosePrefs>({ boldness: "noticeable", upkeep: "medium", undertone: skin?.undertone ?? "neutral" });
  const picks = useMemo(() => rankGoals(reach, { gray }, prefs), [reach, gray, prefs]);
  const top = picks.slice(0, 3);
  const more = picks.slice(3, 7);
  const set = <K extends keyof ChoosePrefs>(key: K) => (value: ChoosePrefs[K]) => setPrefs((p) => ({ ...p, [key]: value }));

  return (
    <div className="choose">
      <section className="panel choose-quiz" aria-label="Three quick questions">
        <Question title="How big a change?" name="boldness" options={BOLDNESS} value={prefs.boldness} onChange={set("boldness")} />
        <Question title="How much upkeep is OK?" name="upkeep" options={UPKEEP} value={prefs.upkeep} onChange={set("upkeep")} />
        <Question
          title="Your skin's undertone"
          name="undertone"
          options={UNDERTONE}
          value={prefs.undertone}
          onChange={set("undertone")}
          note={
            skin ? (
              <><i className="skin-dot" style={{ background: skin.hex }} aria-hidden="true" /> Your selfie suggests <strong>{skin.undertone}</strong>. Change it if that doesn&apos;t feel right.</>
            ) : (
              "Not sure? Hold gold and silver jewelry near your face in daylight: the one that looks better tells you."
            )
          }
        />
      </section>

      <section className="choose-results" aria-labelledby="best-fits" aria-live="polite">
        <h2 id="best-fits">Your best fits</h2>
        <p className="muted small">Each swatch shows what a box would really give your hair, not the color on the box.</p>
        <div className="pick-grid">
          {top.map((pick, i) => <PickCard key={pick.goal.id} pick={pick} rank={RANK[i]} seed={i * 2 + 1} />)}
        </div>

        <ComparePreview picks={top} />

        {more.length > 0 && (
          <>
            <h3 className="more-title">Also worth a look</h3>
            <ul className="more-picks">
              {more.map((pick, i) => (
                <li key={pick.goal.id}>
                  <HairSwatch className="route-swatch" lengths={pick.likelyHex} label={`${pick.goal.name}: likely result`} seed={i} />
                  <div>
                    <strong>{pick.goal.name}</strong>
                    <small>{pick.reasons[0] ?? pick.cautions[0]}</small>
                  </div>
                  <Link href={`/check?mode=goal&goal=${pick.goal.id}`} className="button secondary compact">Check it</Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
