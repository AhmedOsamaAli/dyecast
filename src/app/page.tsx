import Link from "next/link";
import { SwatchCard } from "@/components/swatch-card";
import { EXAMPLES } from "@/data/examples";
import { roundLevel } from "@/lib/engine/levels";
import { resultSwatch } from "@/lib/engine/swatch";
import { Notice } from "@/components/notice";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const hero = EXAMPLES[0];
  const p = hero.prediction;
  return (
    <main>
      <div className="page-shell notice-shell"><Notice code={params.notice} /></div>
      <section className="hero page-shell">
        <div className="hero-copy">
          <p className="eyebrow"><span className="tiny-dot" /> A REALITY CHECK FOR AT-HOME HAIR COLOR</p>
          <h1>The box has a promise.<br /><em>Your hair has a history.</em></h1>
          <p className="hero-description">
            See what a box dye will really do to your hair — before it&apos;s on your head. Pick your goal, scan the box or paste a link,
            and get your likely result, the reasons, and the route that actually gets you there.
          </p>
          <div className="hero-actions">
            <Link href="/register" className="button">Check my hair <span aria-hidden="true">&rarr;</span></Link>
            <Link href="/examples" className="quiet-link">See real examples</Link>
          </div>
          <p className="small muted">Free. Photo optional and never kept unless you choose. Not a miracle promise.</p>
        </div>
        <div className="hero-demo">
          <div className="demo-heading">
            <span className="eyebrow">EXAMPLE FORECAST</span>
            <span className="demo-pill">Dark brown hair + box {hero.shadeCode}</span>
          </div>
          <div className="hero-comparison">
            <SwatchCard label="The box promises" lengths={p.promise.hex} description={p.shade.name} seed={21} />
            <SwatchCard label="Likely on this hair" {...resultSwatch(p)}
              description={`About level ${roundLevel(p.lengths.level)} — warm and brassy`} variant="predicted" seed={22} />
          </div>
          <div className="demo-explanation">
            <span className="step">!</span>
            <p><strong>Box dye lifts only 2–3 levels.</strong><br />Dark hair stops at orange-gold, and the ash in the box can&apos;t cancel it all.</p>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="how-section">
        <div className="page-shell">
          <p className="eyebrow">HOW IT WORKS</p>
          <h2>A little color science before a big change.</h2>
          <div className="feature-grid">
            <article><span className="step">01</span><h3>Describe your hair.</h3><p>Choose your level, tone, history, gray and texture — or let a selfie suggest them with YouCam AI. You stay in control.</p></article>
            <article><span className="step">02</span><h3>Pick a goal or a box.</h3><p>Choose the color you want, snap the box, paste a store link or type the shade code.</p></article>
            <article><span className="step">03</span><h3>See the real result.</h3><p>Box promise vs. your likely result — on hair swatches and your own photo — with the why, the right route and a step-by-step plan.</p></article>
          </div>
        </div>
      </section>

      <section className="page-shell trust-grid">
        <article><h3>Built on hair color science</h3><p className="muted">Lift limits, underlying pigment, &ldquo;color can&apos;t lift color&rdquo;, hot roots, gray resistance and porosity — explained, not hidden.</p></article>
        <article><h3>Private by design</h3><p className="muted">Photos are cleaned in your browser, analyzed and deleted at YouCam right away, and only stored — encrypted — if you ask.</p><Link href="/privacy" className="small">How we handle photos</Link></article>
        <article><h3>Safety first</h3><p className="muted">Allergy alert test, strand test and clear &ldquo;see a colorist&rdquo; stop signs for henna, big lifts and damaged hair.</p></article>
      </section>

      <section className="page-shell closing-note">
        <p className="eyebrow">HONEST BY DESIGN</p>
        <h2>A forecast. Not a guarantee.</h2>
        <p className="muted">DyeCast uses general color rules, not a lab-tested formula for one brand. Your box&apos;s instructions, allergy alert test and strand test always come first.</p>
        <Link href="/register" className="button secondary">Build your hair profile</Link>
      </section>
    </main>
  );
}
