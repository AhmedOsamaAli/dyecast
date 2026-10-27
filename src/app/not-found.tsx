import Link from "next/link";

export default function NotFound() {
  return <main className="page-shell"><section className="panel empty-state">
    <p className="eyebrow">NOT FOUND</p><h1>This page isn&apos;t available.</h1>
    <p className="muted">Saved checks are private. This one may have been deleted or belong to another account.</p>
    <Link href="/studio" className="button">Go to your studio</Link>
  </section></main>;
}
