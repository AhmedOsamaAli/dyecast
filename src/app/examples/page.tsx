import Link from "next/link";
import { SwatchCard } from "@/components/swatch-card";
import { EXAMPLES } from "@/data/examples";
import { levelName, roundLevel } from "@/lib/engine/levels";
import { PRODUCTS } from "@/lib/engine/products";
import { resultSwatch } from "@/lib/engine/swatch";

export const metadata = { title: "Real-world examples" };

const VERDICT = { close: "Close to the box", different: "Noticeably different", "very-different": "Very different" } as const;

export default function ExamplesPage() {
  return (
    <main className="page-shell">
      <div className="page-heading">
        <p className="eyebrow">REAL-WORLD EXAMPLES</p>
        <h1>Same box. Different hair. Different result.</h1>
        <p className="muted">Six common at-home color situations, forecast with the same rules DyeCast uses for your own hair. No account needed.</p>
      </div>
      <div className="examples-list">
        {EXAMPLES.map((ex, i) => {
          const p = ex.prediction;
          return (
            <article key={ex.id} className="panel example">
              <div className="example-head">
                <div>
                  <p className="eyebrow">EXAMPLE {i + 1} · {ex.who}</p>
                  <h2>{ex.title}</h2>
                </div>
                <span className={`verdict-pill ${p.verdict}`}>{VERDICT[p.verdict]}</span>
              </div>
              <div className="comparison-grid">
                <SwatchCard label="Hair today" {...ex.today}
                  description={`Level ${ex.hair.lengthsLevel} · ${levelName(ex.hair.lengthsLevel)}`} seed={i * 3 + 1} />
                <SwatchCard label={`Box ${ex.shadeCode} promises`} lengths={p.promise.hex}
                  description={`${p.shade.name} · ${PRODUCTS[ex.product].short}`} seed={i * 3 + 2} />
                <SwatchCard label="Likely result" {...resultSwatch(p)} variant="predicted"
                  description={p.twoZone ? `Roots ≈ ${roundLevel(p.roots.level)}, lengths ≈ ${roundLevel(p.lengths.level)}` : `About level ${roundLevel(p.lengths.level)}`}
                  seed={i * 3 + 3} />
              </div>
              <p className="example-lesson">{ex.lesson}</p>
              <ul className="example-reasons small muted">
                {p.reasons.slice(0, 3).map((r, j) => <li key={j}><strong>{r.title}.</strong> {r.detail}</li>)}
              </ul>
            </article>
          );
        })}
      </div>
      <section className="closing-note">
        <h2>Now try it with your hair.</h2>
        <p className="muted">Build a free hair profile — by hand or with a selfie — and check any box or goal color.</p>
        <Link href="/register" className="button">Check my hair</Link>
      </section>
    </main>
  );
}
