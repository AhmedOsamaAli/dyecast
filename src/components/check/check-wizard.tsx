"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createCheck, lookupProductLink, type CheckState, type LinkLookup } from "@/app/check/actions";
import { HairSwatch } from "@/components/hair-swatch";
import { GOAL_COLORS } from "@/data/goals";
import { deltaE2000, hexToLab, labToHex } from "@/lib/color";
import { findPaths } from "@/lib/engine/get-there";
import { roundLevel } from "@/lib/engine/levels";
import { predict } from "@/lib/engine/predict";
import { PRODUCTS, PRODUCT_TYPES } from "@/lib/engine/products";
import { decodeShade, findShadeCandidates } from "@/lib/engine/shade-code";
import { resultSwatch } from "@/lib/engine/swatch";
import { TONE_SYSTEM_LABELS } from "@/lib/engine/tones";
import type { DecodedShade, HairProfileInput, ProductType, ToneSystemId } from "@/lib/engine/types";
import type { CheckSource } from "@/lib/checks/validation";
import { blobToCanvas, prepareImage } from "@/lib/client/image";
import { Camera, Hash, Link2, Target as TargetIcon, type LucideIcon } from "lucide-react";

type Mode = CheckSource;

interface Target {
  shadeCode: string;
  system: ToneSystemId;
  product: ProductType;
  source: Mode;
  goalHex?: string;
  goalName?: string;
  tonerCode?: string;
  productUrl?: string;
  productTitle?: string;
}

const MODES: Array<{ id: Mode; label: string; hint: string; icon: LucideIcon }> = [
  { id: "goal", label: "My goal", hint: "Pick the color you want", icon: TargetIcon },
  { id: "code", label: "Shade code", hint: "Type the number on the box", icon: Hash },
  { id: "box-photo", label: "Box photo", hint: "Read it from a photo", icon: Camera },
  { id: "link", label: "Product link", hint: "Paste a store link", icon: Link2 },
];

function systemFor(code: string, current: ToneSystemId): ToneSystemId {
  if (/\d\s*\/\s*\d/.test(code)) return "wella";
  if (/\d\s*-\s*\d/.test(code)) return "schwarzkopf";
  if (/\d[a-z]/i.test(code)) return "us-letter";
  return current === "wella" || current === "schwarzkopf" || current === "us-letter" ? "international" : current;
}

const VERDICT: Record<string, string> = {
  close: "Close to the box",
  different: "Noticeably different",
  "very-different": "Very different from the box",
};

export function CheckWizard({ profile, initialMode = "goal", initialGoal }: {
  profile: HairProfileInput;
  initialMode?: Mode;
  /** Preselected goal color, e.g. from the "I want to…" tiles on the home page. */
  initialGoal?: { hex: string; name: string };
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [target, setTarget] = useState<Target>({ shadeCode: "", system: "international", product: "permanent", source: initialMode });
  const [choice, setChoice] = useState(0);
  const [state, action, pending] = useActionState<CheckState, FormData>(createCheck, {});

  const decoded = useMemo(() => (target.shadeCode ? decodeShade(target.shadeCode, target.system) : null), [target.shadeCode, target.system]);
  const shade: DecodedShade | undefined = decoded?.ok ? decoded.interpretations[Math.min(choice, decoded.interpretations.length - 1)] : undefined;
  const product: ProductType = shade?.suggestedProduct === "high-lift" ? "high-lift" : target.product;
  const forecast = useMemo(() => (shade ? predict(profile, shade, product) : null), [profile, shade, product]);

  function set(next: Partial<Target>) {
    setTarget((previous) => {
      const merged = { ...previous, ...next };
      if (next.shadeCode !== undefined) {
        merged.system = next.system ?? systemFor(next.shadeCode, previous.system);
        // Product words in the input ("toner", "demi", "high lift") pick the product type automatically.
        const hint = next.product ? undefined : decodeShade(next.shadeCode, merged.system).productHint;
        if (hint) merged.product = hint;
      }
      return merged;
    });
    if (next.shadeCode !== undefined) setChoice(0);
  }

  function selectMode(m: Mode) {
    setMode(m);
    setTarget((previous) => ({ ...previous, source: m, goalHex: undefined, goalName: undefined, tonerCode: undefined }));
  }

  return (
    <div className="check-grid">
      <section className="panel" aria-labelledby="target-title">
        <div className="section-heading">
          <span className="step">02</span>
          <div>
            <h2 id="target-title">What are you aiming for?</h2>
            <p className="muted small">Start from the color you want, or from the box you&apos;re holding.</p>
          </div>
        </div>
        <div className="mode-tabs" role="tablist" aria-label="Ways to choose a shade">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={mode === m.id ? "active" : ""} onClick={() => selectMode(m.id)}>
              <m.icon size={18} aria-hidden="true" />
              <strong>{m.label}</strong>
              <span>{m.hint}</span>
            </button>
          ))}
        </div>
        <div role="tabpanel" className="mode-panel">
          {mode === "goal" && <GoalTab profile={profile} target={target} initialGoal={initialGoal} onPick={(t) => set(t)} />}
          {mode === "code" && <CodeTab target={target} onChange={set} />}
          {mode === "box-photo" && <BoxPhotoTab onPick={(t) => set({ ...t, source: "box-photo" })} />}
          {mode === "link" && <LinkTab onPick={(t) => set({ ...t, source: "link" })} />}
        </div>
      </section>

      <aside className="panel forecast-panel" aria-live="polite">
        <p className="eyebrow">LIVE FORECAST</p>
        {!target.shadeCode && <p className="muted">Choose a goal or a box to see your forecast.</p>}
        {decoded && !decoded.ok && <p className="notice danger small">{decoded.error}</p>}
        {decoded?.ok && decoded.interpretations.length > 1 && (
          <fieldset className="choices">
            <legend className="small">This code can be read two ways:</legend>
            {decoded.interpretations.map((s, i) => (
              <label key={`${s.code}-${i}`} className="check-row">
                <input type="radio" name="interpretation" checked={choice === i} onChange={() => setChoice(i)} />
                <span>{s.code} · {s.name}{s.note ? ` — ${s.note}` : ""}</span>
              </label>
            ))}
          </fieldset>
        )}
        {shade && forecast && (
          <>
            <h2 className="forecast-title">{shade.code} · {shade.name}</h2>
            {target.goalName && <p className="small muted">Route to your goal: {target.goalName}{target.tonerCode ? `, then toner ${target.tonerCode}` : ""}</p>}
            {target.productTitle && <p className="small muted">From: {target.productTitle}</p>}
            {shade.note && decoded?.interpretations.length === 1 && <p className="small muted">{shade.note}</p>}
            <div className="forecast-swatches">
              <figure>
                <HairSwatch lengths={forecast.promise.hex} label={`Box promise: ${shade.name}`} seed={11} />
                <figcaption>Box promise</figcaption>
              </figure>
              <figure>
                <HairSwatch {...resultSwatch(forecast)} label="Your likely result" seed={12} />
                <figcaption>Likely on you · level {roundLevel(forecast.lengths.level)}</figcaption>
              </figure>
            </div>
            <p className={`verdict-pill ${forecast.verdict}`}>{VERDICT[forecast.verdict]}</p>
            {forecast.reasons[0] && <p className="small">{forecast.reasons.find((r) => r.rule !== "R2")?.detail ?? forecast.reasons[0].detail}</p>}

            <div className="form-grid compact-grid">
              <div className="field">
                <label htmlFor="product">Product type</label>
                <select id="product" value={product} disabled={shade.suggestedProduct === "high-lift"}
                  onChange={(e) => set({ product: e.target.value as ProductType })}>
                  {PRODUCT_TYPES.map((p) => <option key={p} value={p}>{PRODUCTS[p].label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="system">Numbering</label>
                <select id="system" value={target.system} onChange={(e) => set({ system: e.target.value as ToneSystemId })}>
                  {(Object.keys(TONE_SYSTEM_LABELS) as ToneSystemId[]).map((s) => <option key={s} value={s}>{TONE_SYSTEM_LABELS[s]}</option>)}
                </select>
              </div>
            </div>
            <p className="small muted">{PRODUCTS[product].description}</p>
          </>
        )}
        <form action={action}>
          <input type="hidden" name="shadeCode" value={shade?.code ?? target.shadeCode} />
          <input type="hidden" name="system" value={shade?.system ?? target.system} />
          <input type="hidden" name="product" value={product} />
          <input type="hidden" name="source" value={target.source} />
          <input type="hidden" name="goalHex" value={target.goalHex ?? ""} />
          <input type="hidden" name="goalName" value={target.goalName ?? ""} />
          <input type="hidden" name="tonerCode" value={target.tonerCode ?? ""} />
          <input type="hidden" name="productUrl" value={target.productUrl ?? ""} />
          <input type="hidden" name="productTitle" value={target.productTitle ?? ""} />
          {state.error && <p role="alert" className="notice danger small">{state.error}</p>}
          <button className="button full" disabled={!shade || pending}>{pending ? "Saving…" : "See my full reality check"}</button>
        </form>
      </aside>
    </div>
  );
}

function CodeTab({ target, onChange }: { target: Target; onChange: (t: Partial<Target>) => void }) {
  return (
    <div className="field">
      <label htmlFor="shadeCode">Shade code on the box</label>
      <input id="shadeCode" className="shade-input" value={target.shadeCode} placeholder="e.g. 9.1, 7/43, 6G, 5-0"
        maxLength={60} autoComplete="off" onChange={(e) => onChange({ shadeCode: e.target.value, source: "code" })} />
      <small className="muted">Use the number, not just the name — names vary by brand. Add words like &quot;toner&quot; or &quot;demi&quot; if they&apos;re on the box.</small>
    </div>
  );
}

function GoalTab({ profile, target, initialGoal, onPick }: {
  profile: HairProfileInput;
  target: Target;
  initialGoal?: { hex: string; name: string };
  onPick: (t: Partial<Target>) => void;
}) {
  const [goal, setGoal] = useState<{ hex: string; name: string } | null>(initialGoal ?? null);
  const [matching, setMatching] = useState("");
  const paths = useMemo(() => (goal ? findPaths(profile, hexToLab(goal.hex), { limit: 3 }) : null), [profile, goal]);

  async function matchPhoto(file: File | undefined) {
    if (!file) return;
    setMatching("Measuring the hair in your photo on this device…");
    try {
      const { segmentHair, hasHair, measureHair } = await import("@/lib/client/hair-vision");
      const prepared = await prepareImage(file, 1024);
      const canvas = await blobToCanvas(prepared.blob);
      URL.revokeObjectURL(prepared.url);
      const mask = await segmentHair(canvas);
      const lab = hasHair(mask) ? measureHair(canvas, mask) : null;
      if (!lab) throw new Error("We couldn't find hair in that photo.");
      setGoal({ hex: labToHex(lab), name: "Your inspiration photo" });
      setMatching("");
    } catch (e) {
      setMatching(e instanceof Error ? e.message : "That photo didn't work.");
    }
  }

  return (
    <div className="goal-tab">
      <div className="goal-grid" role="radiogroup" aria-label="Goal colors">
        {GOAL_COLORS.map((g, index) => (
          <button key={g.id} type="button" role="radio" aria-checked={goal?.hex === g.hex}
            className={`goal-option ${goal?.hex === g.hex ? "selected" : ""}`} onClick={() => setGoal({ hex: g.hex, name: g.name })}>
            <HairSwatch lengths={g.hex} label={g.name} seed={index} className="goal-swatch" />
            <span>{g.name}</span>
          </button>
        ))}
      </div>
      <label className="upload-inline">
        <input type="file" accept="image/*" onChange={(e) => matchPhoto(e.target.files?.[0])} />
        <span>Or match the hair in an inspiration photo <small>(measured on this device, never uploaded)</small></span>
      </label>
      {matching && <p className="small muted" role="status">{matching}</p>}

      {goal && paths && (
        <div className="routes">
          <h3>Routes to {goal.name.toLowerCase()} from your hair</h3>
          {paths.professional && <p className="notice small">{paths.professionalReason}</p>}
          <ol className="route-list">
            {paths.options.map((o) => {
              const [color, toner] = o.steps;
              const selected = target.goalHex === goal.hex && target.shadeCode === color.shade.code && (target.tonerCode ?? "") === (toner?.shade.code ?? "");
              return (
                <li key={o.id} className={selected ? "selected" : ""}>
                  <HairSwatch lengths={o.resultHex} label={`Predicted result of ${color.shade.code}`} seed={o.steps.length * 5 + color.shade.level} className="route-swatch" />
                  <div>
                    <strong>{color.shade.code}{toner ? ` + ${toner.shade.code} toner` : ""}</strong>
                    <span className="small muted">{color.shade.name} · {PRODUCTS[color.shade.product].label}</span>
                    <span className="small">{o.distance < 6 ? "Very close to your goal" : o.distance < 12 ? "Close-ish to your goal" : "Still far from your goal"}</span>
                  </div>
                  <button type="button" className="button compact secondary"
                    onClick={() => onPick({
                      shadeCode: color.shade.code,
                      system: "international",
                      product: color.shade.product,
                      source: "goal",
                      goalHex: goal.hex,
                      goalName: goal.name,
                      tonerCode: toner?.shade.code,
                    })}>
                    {selected ? "Selected" : "Check this"}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="goal-compare small muted">
            <i style={{ background: goal.hex }} /> Your goal ·
            {paths.options[0] && ` best route lands ${deltaE2000(hexToLab(goal.hex), paths.options[0].resultLab).toFixed(1)} ΔE away`}
          </div>
        </div>
      )}
    </div>
  );
}

function BoxPhotoTab({ onPick }: { onPick: (t: Partial<Target>) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const candidates = useMemo(() => (text ? findShadeCandidates(text) : []), [text]);
  const hint = useMemo(() => (text ? decodeShade(text).productHint : undefined), [text]);

  async function read(file: File | undefined) {
    if (!file) return;
    setError("");
    setText("");
    try {
      const prepared = await prepareImage(file, 1600);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = prepared.url;
      setPreview(prepared.url);
      setProgress(0);
      const { readBoxText } = await import("@/lib/client/ocr");
      const result = await readBoxText(prepared.blob, setProgress);
      setText(result);
      if (!findShadeCandidates(result).length) setError("We couldn't spot a shade number. Try a closer, straight-on photo of the front, or type the code.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't read that photo.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="box-photo-tab">
      <label className="upload-tile wide">
        {preview ? <img src={preview} alt="Box photo preview" /> :  <span>Take a photo of the front of the box<br /><small>Read on this device — the photo is never uploaded</small></span>}
        <input type="file" accept="image/*" capture="environment" onChange={(e) => read(e.target.files?.[0])} />
      </label>
      {progress !== null && (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.max(5, progress * 100)}%` }} />
          <small>Reading the box…</small>
        </div>
      )}
      {error && <p className="notice small" role="alert">{error}</p>}
      {candidates.length > 0 && (
        <fieldset className="choices">
          <legend className="small">We found these shade codes — pick the one on the front:</legend>
          {candidates.map((c) => (
            <button key={c.shade.code} type="button" className="candidate"
              onClick={() => onPick({ shadeCode: c.shade.code, system: c.shade.system, ...(hint ? { product: hint } : {}) })}>
              <strong>{c.shade.code}</strong> {c.shade.name} <small className="muted">read from “{c.token}”</small>
            </button>
          ))}
        </fieldset>
      )}
      {text && (
        <details className="small muted">
          <summary>Text we read</summary>
          <p>{text.slice(0, 400)}</p>
        </details>
      )}
    </div>
  );
}

function LinkTab({ onPick }: { onPick: (t: Partial<Target>) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LinkLookup | null>(null);

  async function lookup() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await lookupProductLink(url));
    } catch {
      setResult({ ok: false, error: "Something went wrong. Type the code instead." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="link-tab">
      <div className="field">
        <label htmlFor="productUrl">Product page link</label>
        <div className="inline-input">
          <input id="productUrl" type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="button" className="button compact" disabled={!url || busy} onClick={lookup}>{busy ? "Reading…" : "Find shade"}</button>
        </div>
        <small className="muted">We read the page&apos;s title and product details on our server — no tracking, nothing stored.</small>
      </div>
      {result && !result.ok && <p className="notice danger small" role="alert">{result.error}</p>}
      {result?.ok && (
        <div className="link-result">
          {result.title && <p><strong>{result.title}</strong>{result.brand ? ` · ${result.brand}` : ""}</p>}
          {result.note && <p className="small muted">{result.note}</p>}
          {result.candidates.length ? (
            <fieldset className="choices">
              <legend className="small">Pick the shade from this listing:</legend>
              {result.candidates.map((c) => (
                <button key={c.code} type="button" className="candidate"
                  onClick={() => onPick({ shadeCode: c.code, system: c.system, productUrl: url, productTitle: result.title, ...(result.productHint ? { product: result.productHint } : {}) })}>
                  <strong>{c.code}</strong> {c.name} <small className="muted">from “{c.token}”</small>
                </button>
              ))}
            </fieldset>
          ) : (
            <p className="notice small">We couldn&apos;t find a shade number on that page. Use the Shade code tab instead.</p>
          )}
        </div>
      )}
    </div>
  );
}
