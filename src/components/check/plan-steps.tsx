import { PHASE_LABELS, type Plan, type PlanPhase } from "@/lib/engine/plan";

const ORDER: PlanPhase[] = ["decide", "before", "apply", "after"];

export function PlanSteps({ plan }: { plan: Plan }) {
  return (
    <section className="panel plan-panel" aria-labelledby="plan-title">
      <p className="eyebrow">YOUR STEP-BY-STEP PLAN</p>
      <h2 id="plan-title">{plan.professional ? "Before anything else: this one needs a pro" : "How to get the best result from this box"}</h2>
      {ORDER.map((phase) => {
        const steps = plan.steps.filter((s) => s.phase === phase);
        if (!steps.length) return null;
        return (
          <div key={phase} className="plan-phase">
            <h3>{PHASE_LABELS[phase]}</h3>
            <ol>
              {steps.map((step) => (
                <li key={step.id} className={`plan-step ${step.kind}`}>
                  <span className="plan-kind">{step.kind === "stop" ? "Stop & think" : step.kind === "tip" ? "Tip" : "Do"}</span>
                  <div>
                    <strong>{step.title}</strong>
                    {step.when && <span className="plan-when">{step.when}</span>}
                    <p className="small muted">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
      <p className="small muted">Your box&apos;s leaflet always comes first. This plan is general guidance, not medical or professional advice.</p>
    </section>
  );
}
