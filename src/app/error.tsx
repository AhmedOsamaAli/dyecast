"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("DyeCast request failed", error.digest ?? error.message);
  }, [error]);
  return (
    <main className="page-shell">
      <section className="panel empty-state" role="alert">
        <h1>We couldn&apos;t finish that request.</h1>
        <p className="muted">Nothing here should be taken as a successful save. Try again, or start a new check.</p>
        {error.digest && <p className="small muted">Reference: {error.digest}</p>}
        <div className="hero-actions">
          <button className="button" onClick={reset}>Try again</button>
          <Link href="/check">Back to checks</Link>
        </div>
      </section>
    </main>
  );
}
