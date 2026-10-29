import Link from "next/link";
import { ArrowRight, Droplet, FlaskConical, Layers, Link2, MoveHorizontal, Palette, ScanLine, ShieldCheck, Sparkles, Target } from "lucide-react";
import { HairSwatch } from "@/components/hair-swatch";
import { Notice } from "@/components/notice";
import { CompareSlider } from "@/components/ui/compare-slider";
import { EXAMPLES } from "@/data/examples";
import { GOAL_COLORS } from "@/data/goals";
import { getCurrentUser } from "@/lib/auth/session";
import { roundLevel } from "@/lib/engine/levels";
import { resultSwatch } from "@/lib/engine/swatch";

const INTENTS: Array<{ goal: string; title: string; text: string }> = [
  { goal: "icy-ash", title: "Go blonde", text: "From brown or dark hair to a light, cool blonde." },
  { goal: "caramel", title: "Warm it up", text: "Caramel, honey and golden browns." },
  { goal: "copper", title: "Go red", text: "Copper, auburn or a bold red." },
  { goal: "espresso", title: "Go darker", text: "A deeper brown or a soft black." },
  { goal: "chocolate", title: "Cover grays", text: "Natural browns that hide gray." },
  { goal: "beige", title: "Tone down brass", text: "A neutral blonde without the orange." },
];

const STEPS = [
  { icon: Palette, title: "Describe your hair", text: "Choose your level, tone, history and gray by hand, or let a selfie suggest them with YouCam AI. You stay in control." },
  { icon: Target, title: "Pick a goal or a box", text: "Choose the color you want, type the shade code, snap the box, or paste a store link." },
  { icon: Layers, title: "See the real result", text: "The box promise next to your likely result, on swatches and your own photo, with the why and a plan." },
];

const FEATURES = [
  { icon: Sparkles, title: "YouCam AI on your photo", text: "Facial Color Tones and Hair Length read your starting point; Hair Color renders the likely result, not just the box." },
  { icon: FlaskConical, title: "13 color-chemistry rules", text: "Lift limits, underlying pigment, color-can't-lift-color, hot roots, gray and porosity, explained in plain words." },
  { icon: ScanLine, title: "Reads the box for you", text: "Point your phone at the box: the shade number is read on your device." },
  { icon: Link2, title: "Paste any store link", text: "We read the product page and find the shade, so you can check before you buy." },
  { icon: Droplet, title: "Routes, toners and boxes", text: "Better routes to your goal, a toner when it helps, and how many boxes your hair needs." },
  { icon: ShieldCheck, title: "Private by design", text: "Photos are cleaned on your device, deleted at YouCam right away, and stored encrypted only if you ask." },
];

const FAQ = [
  { q: "How accurate is the forecast?", a: "It applies general hair color chemistry to the hair you describe, so it's a well-reasoned forecast, not a lab test of one brand's formula. Brands, lighting and your hair's condition still vary — a strand test is the only true preview." },
  { q: "Do you keep my photo?", a: "No, unless you turn on encrypted storage. Photos are cleaned in your browser, YouCam deletes them as soon as we receive the result, and box and inspiration photos never leave your device." },
  { q: "Which boxes work?", a: "Any box with a shade number: international (7.1), Wella-style (7/1), Schwarzkopf-style (7-1) and US letter codes (6G). You can also start from the color you want." },
  { q: "Is it free?", a: "Yes. Create an account to save your hair profile and your checks." },
  { q: "Is this medical advice?", a: "No. DyeCast adds a safety checklist and stop signs, but your product's instructions, the allergy alert test and a strand test always come first." },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const hero = EXAMPLES[0];
  const p = hero.prediction;
  const goals = Object.fromEntries(GOAL_COLORS.map((g) => [g.id, g]));
  const start = user ? "/check" : "/register";

  return (
    <main>
      <div className="page-shell notice-shell"><Notice code={params.notice} /></div>
      <section className="hero page-shell">
        <div className="hero-copy">
          <p className="pill"><Sparkles size={14} aria-hidden="true" /> A reality check for at-home hair color</p>
          <h1>The box has a promise.<br /><em>Your hair has a history.</em></h1>
          <p className="hero-description">
            See what a box dye will really do to your hair — before it&apos;s on your head. Pick your goal, scan the box or paste a link,
            and get your likely result, the reasons, and the route that actually gets you there.
          </p>
          <div className="hero-actions">
            <Link href={start} className="button large">Check my hair <ArrowRight size={18} aria-hidden="true" /></Link>
            <Link href="/examples" className="button ghost large">See real examples</Link>
          </div>
          <ul className="trust-row">
            <li><FlaskConical size={16} aria-hidden="true" /> Hair color chemistry</li>
            <li><Sparkles size={16} aria-hidden="true" /> YouCam AI analysis & try-on</li>
            <li><ShieldCheck size={16} aria-hidden="true" /> Private by design</li>
          </ul>
        </div>
        <div className="hero-visual">
          <div className="hero-card">
            <div className="hero-card-head">
              <span className="small">Dark brown hair + box {hero.shadeCode}</span>
              <span className={`verdict-pill ${p.verdict}`}>Very different</span>
            </div>
            <CompareSlider
              ratio={0.86}
              initial={55}
              before={<HairSwatch lengths={p.promise.hex} label={`The box promises ${p.shade.name}`} seed={21} />}
              after={<HairSwatch {...resultSwatch(p)} label={`Likely on dark hair: about level ${roundLevel(p.lengths.level)}, warm and brassy`} seed={21} />}
              beforeLabel="Box promise"
              afterLabel="Likely on you"
            />
            <p className="compare-hint"><MoveHorizontal size={15} aria-hidden="true" /> Drag to compare</p>
            <p className="hero-card-foot"><strong>Box dye lifts only 2–3 levels.</strong> Dark hair stops at orange-gold, and the ash in the box can&apos;t cancel it all.</p>
          </div>
        </div>
      </section>

      <section className="page-shell intents" aria-labelledby="intents-title">
        <p className="eyebrow">START WITH YOUR GOAL</p>
        <h2 id="intents-title">I want to…</h2>
        <div className="intent-grid">
          {INTENTS.map((intent, index) => {
            const goal = goals[intent.goal];
            return (
              <Link key={intent.goal} className="intent" href={user ? `/check?mode=goal&goal=${intent.goal}` : "/register"}>
                {goal && <HairSwatch className="intent-swatch" lengths={goal.hex} label={goal.name} seed={index} />}
                <span>
                  <strong>{intent.title}</strong>
                  <small>{intent.text}</small>
                </span>
                <ArrowRight size={18} aria-hidden="true" className="intent-arrow" />
              </Link>
            );
          })}
        </div>
      </section>

      <section id="how-it-works" className="how-section">
        <div className="page-shell">
          <p className="eyebrow">HOW IT WORKS</p>
          <h2>A little color science before a big change.</h2>
          <ol className="steps">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title}>
                <span className="icon-badge" aria-hidden="true"><Icon size={20} /></span>
                <span className="step-num">0{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="page-shell features" aria-labelledby="features-title">
        <p className="eyebrow">WHY IT&apos;S DIFFERENT</p>
        <h2 id="features-title">Try-on shows the box. DyeCast shows your hair.</h2>
        <div className="feature-cards">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <article key={title} className="feature-card">
              <span className="icon-badge" aria-hidden="true"><Icon size={20} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="page-shell faq" aria-labelledby="faq-title">
        <div>
          <p className="eyebrow">QUESTIONS</p>
          <h2 id="faq-title">Good to know</h2>
          <p className="muted">Honest answers about accuracy, privacy and safety. <Link href="/privacy">How we handle photos</Link></p>
        </div>
        <div className="faq-list">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="page-shell closing-band">
        <div>
          <p className="eyebrow">HONEST BY DESIGN</p>
          <h2>A forecast. Not a guarantee.</h2>
          <p>Know what to expect, choose a better route, and keep your hair healthy — in about two minutes.</p>
        </div>
        <Link href={start} className="button large light">Build your hair profile <ArrowRight size={18} aria-hidden="true" /></Link>
      </section>
    </main>
  );
}
