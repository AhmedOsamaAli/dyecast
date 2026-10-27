import { SwatchCard } from "@/components/swatch-card";
import { HairSwatch } from "@/components/hair-swatch";
import { PhotoPreview } from "@/components/check/photo-preview";
import { PlanSteps } from "@/components/check/plan-steps";
import { deltaE2000, hexToLab } from "@/lib/color";
import { levelName, roundLevel } from "@/lib/engine/levels";
import { PRODUCTS } from "@/lib/engine/products";
import { resultSwatch, todaySwatch } from "@/lib/engine/swatch";
import { planFor, type CheckReport } from "@/lib/checks/report";
import type { StudioInput } from "@/lib/checks/validation";

const HEADLINE = {
  close: "Close to the box",
  different: "Expect a different result",
  "very-different": "The box can't deliver this on your hair",
} as const;

const SOURCE_LABEL: Record<string, string> = {
  code: "Shade code",
  link: "Product link",
  "box-photo": "Box photo",
  goal: "Your goal",
};

const STREAK_TODAY = { none: "", gray: " · with gray", highlights: " · with highlights" } as const;
const STREAK_RESULT = { none: "", gray: " · grays stay brighter", highlights: " · highlights stay as stripes" } as const;

export function ResultView({ id, input, report, hasStoredSelfie }: {
  id: string;
  input: StudioInput;
  report: CheckReport;
  hasStoredSelfie: boolean;
}) {
  const p = report.prediction;
  const plan = planFor(input, report);
  const today = todaySwatch(input);
  const likely = resultSwatch(p);
  const goalGap = input.goalHex ? deltaE2000(hexToLab(input.goalHex), hexToLab(p.overallHex)) : null;

  return (
    <div className="stack result-stack">
      <section className="result-intro">
        <div>
          <p className="eyebrow">YOUR REALITY CHECK · {SOURCE_LABEL[input.source ?? "code"] ?? "Shade"} · {p.shade.code}</p>
          <h1>{HEADLINE[p.verdict]}.</h1>
          <p className="muted">
            {p.shade.name} · {PRODUCTS[p.product].label}
            {input.productTitle ? ` · ${input.productTitle}` : ""}
          </p>
        </div>
        <div className="gap-stat">
          <strong>{p.gap.toFixed(1)}</strong>
          <span>color gap (ΔE00) · certainty: {p.confidenceLabel}</span>
        </div>
      </section>

      <section className="comparison-grid" aria-label="Hair color comparison">
        <SwatchCard label="Your hair today" {...today} seed={2}
          description={`Level ${input.lengthsLevel} · ${levelName(input.lengthsLevel)}${today.roots ? ` · roots level ${input.naturalLevel}` : ""}${STREAK_TODAY[today.streaks?.kind ?? "none"]}`} />
        <SwatchCard label="What the box promises" lengths={p.promise.hex} seed={4}
          description={`Level ${p.promise.level} · ${p.shade.name}`} />
        <SwatchCard label="What you'll likely get" {...likely} seed={6} variant="predicted"
          description={`${p.twoZone
            ? `Roots ≈ level ${roundLevel(p.roots.level)}, lengths ≈ level ${roundLevel(p.lengths.level)}`
            : `About level ${roundLevel(p.lengths.level)} · ${levelName(p.lengths.level)}`}${STREAK_RESULT[likely.streaks?.kind ?? "none"]}`} />
      </section>

      {input.goalHex && goalGap !== null && (
        <section className="panel goal-panel">
          <HairSwatch className="mini-swatch" lengths={input.goalHex} label={`Your goal: ${input.goalName ?? "goal color"}`} seed={9} />
          <div>
            <p className="eyebrow">YOUR GOAL</p>
            <h2>{input.goalName ?? "Your goal color"}</h2>
            <p className="muted">
              {goalGap < 6 ? "This route lands very close to your goal." : goalGap < 12 ? "This route gets you close-ish to your goal." : "This route still lands far from your goal."}
              {input.tonerCode ? ` It includes a ${input.tonerCode} toner step.` : ""}
            </p>
          </div>
        </section>
      )}

      <PhotoPreview checkId={id} promiseHex={p.promise.hex} rootsHex={p.roots.hex} lengthsHex={p.lengths.hex}
        twoZone={p.twoZone} hasStoredSelfie={hasStoredSelfie} />

      <div className="result-columns">
        <section className="panel">
          <p className="eyebrow">THE WHY, NOT JUST THE WHAT</p>
          <h2>Behind your forecast</h2>
          <div className="reasons">
            {p.reasons.map((reason, index) => (
              <article key={`${reason.rule}-${index}`}>
                <span className="rule-tag">{reason.rule}</span>
                <div>
                  <h3>{reason.title}</h3>
                  <p className="muted">{reason.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <aside className="stack">
          <section className="panel">
            <p className="eyebrow">BEFORE YOU BUY</p>
            <h2>How many boxes?</h2>
            <div className="boxes-number">
              {report.boxes.boxes}
              <span>{report.boxes.boxes === 1 ? "box" : "boxes"} for your length and density</span>
            </div>
            <p className="muted small">{report.boxes.note}</p>
          </section>
          <section className="panel">
            <p className="eyebrow">{input.goalHex ? "OTHER ROUTES TO YOUR GOAL" : "BETTER ROUTES TO THIS SHADE"}</p>
            <h2>Get closer</h2>
            {report.needsConsultation ? (
              <p className="notice danger small">Henna history or damaged ends make a box recommendation unreliable. Take your hair history to a colorist.</p>
            ) : (
              <>
                {report.paths?.professional && <p className="notice small">{report.paths.professionalReason}</p>}
                <ul className="path-list">
                  {report.paths?.options.map((option) => (
                    <li key={option.id}>
                      <HairSwatch className="path-swatch" lengths={option.resultHex} label={`Predicted result of ${option.steps[0].shade.code}`} seed={option.steps.length * 3 + option.steps[0].shade.level} />
                      <div>
                        <strong>{option.steps.map((step) => `${step.shade.code}${step.role === "toner" ? " toner" : ""}`).join(" + ")}</strong>
                        <span className="small muted">{option.steps[0].shade.name} · {PRODUCTS[option.steps[0].shade.product].label}</span>
                        <span className="small">{option.distance < 6 ? "Very close" : option.distance < 12 ? "Close-ish" : "Still far"} (ΔE {option.distance.toFixed(1)})</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="small muted">Generic shade references by level and tone — match the code on any brand&apos;s box.</p>
              </>
            )}
          </section>
        </aside>
      </div>

      <PlanSteps plan={plan} />

      <section className="panel safety-panel">
        <p className="eyebrow">READ BEFORE YOU DYE</p>
        <h2>Your safety checklist</h2>
        <div className="safety-grid">
          {report.safety.map((item) => (
            <article key={item.id}>
              <span className={`safety-label ${item.level}`}>{item.level === "must" ? "Important" : item.level === "should" ? "Recommended" : "Remember"}</span>
              <h3>{item.title}</h3>
              <p className="small muted">{item.detail}</p>
            </article>
          ))}
        </div>
        <p className="small muted">
          Sources: <a href="https://www.fda.gov/cosmetics/cosmetic-products/hair-dyes" target="_blank" rel="noreferrer">FDA — hair dye safety checklist</a>,{" "}
          <a href="https://www.nhs.uk/conditions/hair-dye-reactions/" target="_blank" rel="noreferrer">NHS — hair dye reactions</a>,{" "}
          <a href="https://www.nhs.uk/best-start-in-life/pregnancy/using-hair-dye-in-pregnancy-is-it-safe/" target="_blank" rel="noreferrer">NHS — hair dye in pregnancy</a>,{" "}
          <a href="https://eur-lex.europa.eu/eli/reg/2009/1223/oj" target="_blank" rel="noreferrer">EU Cosmetics Regulation 1223/2009</a> and your product&apos;s instructions. Not medical advice.
        </p>
      </section>

      <div className="notice">
        <strong>A forecast, not a guarantee.</strong>
        <p>Swatches and previews are illustrations from a rule-based color model. Lighting, screens, formulas and your hair&apos;s condition change real results — a strand test is the only true preview.</p>
      </div>
    </div>
  );
}
