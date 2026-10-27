import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listChecks } from "@/lib/checks/store";
import { HairSwatch } from "@/components/hair-swatch";
import { resultSwatch } from "@/lib/engine/swatch";

export const metadata = { title: "Saved checks" };

export default async function HistoryPage() {
  const user = await requireUser();
  const checks = await listChecks(user.id);
  return (
    <main className="page-shell">
      <div className="page-heading">
        <p className="eyebrow">YOUR COLOR NOTEBOOK</p>
        <h1>Less guesswork, saved.</h1>
        <p className="muted">Your 50 most recent checks. Each keeps the hair details and forecast from that moment.</p>
      </div>
      {checks.length ? (
        <div className="history-grid">
          {checks.map((check) => {
            const p = check.report.prediction;
            return (
              <Link className="panel history-card" href={`/checks/${check.id}`} key={check.id}>
                <div className="history-swatches">
                  <HairSwatch lengths={p.promise.hex} label="Box promise" seed={1} />
                  <HairSwatch {...resultSwatch(p)} label="Likely result" seed={2} />
                </div>
                <p className="eyebrow">{check.createdAt.toISOString().slice(0, 10)}</p>
                <h2>{p.shade.code}</h2>
                <p>{check.input.goalName ? `Goal: ${check.input.goalName}` : p.shade.name}</p>
                <span className="small muted">From level {check.input.lengthsLevel} · gap {p.gap.toFixed(1)}</span>
                <strong className="history-link">Open reality check</strong>
              </Link>
            );
          })}
        </div>
      ) : (
        <section className="panel empty-state">
          <h2>A fresh start.</h2>
          <p className="muted">Check your first shade to start your private color notebook.</p>
          <Link className="button" href="/check">Check a shade</Link>
        </section>
      )}
    </main>
  );
}
