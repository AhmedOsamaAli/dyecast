import { useEffect, useState } from "react";
import {
  AbsoluteFill, Audio, cancelRender, continueRender, delayRender, Easing,
  Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import story from "./beats.json";

type Beat = (typeof story.beats)[number];
export const FULL_BEATS = story.beats;
export const SHORT_BEATS = story.teaser.map((item) => {
  const beat = FULL_BEATS.find((entry) => entry.id === item.id);
  if (!beat) throw new Error(`Unknown teaser beat: ${item.id}`);
  return { ...beat, seconds: item.seconds };
});

const ease = Easing.inOut(Easing.cubic);
const img = (name: string) => staticFile(`footage/${name}`);
const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

function Wordmark() {
  return <span className="wordmark">dye<i>cast</i><b>.</b></span>;
}

function Capture({ file, alternate, portraitFile }: { file: string; alternate?: string; portraitFile?: string }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const entrance = spring({ frame: frame - 7, fps, config: { damping: 24, stiffness: 110 } });
  const change = interpolate(frame, [fps * 5, fps * 6], [0, 1], { ...clamp, easing: ease });
  const push = interpolate(frame, [0, fps * 15], [1, 1.025], clamp);
  const source = portrait && portraitFile ? portraitFile : file;
  return (
    <div className="capture" style={{
      opacity: entrance, transform: `perspective(2200px) translateY(${(1 - entrance) * 65}px) rotateY(${portrait ? 0 : (1 - entrance) * -8}deg) scale(${push})`,
    }}>
      <div className="browser-bar">
        <div className="browser-dots"><span /><span /><span /></div>
        <span>dyecast.vercel.app</span><span className="live-mark">REAL APP</span>
      </div>
      <div className="capture-screen">
        <Img src={img(source)} />
        {alternate && !portrait && <Img src={img(alternate)} style={{ position: "absolute", inset: 0, opacity: change }} />}
      </div>
    </div>
  );
}

function BigCompare() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const split = interpolate(frame / fps, [0, 1.8, 3.6, 5.5, 8, 15], [50, 50, 78, 22, 50, 50], { ...clamp, easing: ease });
  return (
    <div className="hair-compare">
      <Img src={img("swatch-likely.png")} className="macro-hair" />
      <Img src={img("swatch-box.png")} className="macro-hair" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />
      <div className="hair-shade" />
      <span className="compare-label left">Box promise</span>
      <span className="compare-label right">Likely on your hair</span>
      <div className="compare-divider" style={{ left: `${split}%` }}><span>&lt; &gt;</span></div>
      <div className="compare-bottom">Actual app forecast / shade 9.1</div>
    </div>
  );
}

function PhotoStrip() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div className="photo-strip">
      {[
        ["photo-today.jpg", "Today"],
        ["photo-box.jpg", "The box"],
        ["photo-likely.jpg", "Your forecast"],
      ].map(([file, label], index) => {
        const enter = spring({ frame: frame - index * 7 - 6, fps, config: { damping: 22 } });
        return (
          <figure key={file} style={{ opacity: enter, transform: `translateY(${(1 - enter) * 70}px)` }}>
            <Img src={img(file)} /><figcaption>{label}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

function Privacy() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const points = [
    ["01", "Quick previews on your device"],
    ["02", "Consent before YouCam processing"],
    ["03", "Stored selfies off by default"],
    ["04", "Local photos cleared at sign-out"],
  ];
  return (
    <div className="privacy-cards">
      {points.map(([number, title], i) => {
        const progress = spring({ frame: frame - i * 16 - 5, fps, config: { damping: 25 } });
        return <div key={number} style={{ opacity: progress, transform: `translateX(${(1 - progress) * 60}px)` }}>
          <span>{number}</span><strong>{title}</strong><b>&#10003;</b>
        </div>;
      })}
      <p>Deletion is requested after delivery and retried if unconfirmed.</p>
    </div>
  );
}

function Scene({ beat, index, total }: { beat: Beat; index: number; total: number }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const enter = spring({ frame: frame - 3, fps, config: { damping: 26, stiffness: 125 } });
  const dark = beat.id === "close";
  let media;
  switch (beat.id) {
    case "hook": media = <BigCompare />; break;
    case "profile": media = <Capture file="profile.png" portraitFile="photo-assist.png" />; break;
    case "choose": media = <Capture file="choose-cards.png" alternate="choose-alternate.png" portraitFile="choose-best.png" />; break;
    case "try": media = <Capture file="try-colors.png" portraitFile="try-colors-phone.png" />; break;
    case "reality": media = frame < fps * 7 ? <BigCompare /> : <PhotoStrip />; break;
    case "why": media = <Capture file="why.png" />; break;
    case "buy": media = <Capture file="products.png" alternate="plan.png" />; break;
    case "privacy": media = <Privacy />; break;
    case "close": media = <div className="closing-hair"><Img src={img("swatch-likely.png")} /><div /></div>; break;
    default: throw new Error(`Unsupported scene: ${beat.id}`);
  }
  return (
    <AbsoluteFill className={`scene ${portrait ? "portrait" : "landscape"} ${dark ? "dark" : ""} scene-${beat.id}`}
      style={{ opacity: interpolate(frame, [0, 7], [0, 1], clamp) }}>
      <div className="background-orbit orbit-one" /><div className="background-orbit orbit-two" />
      <header className="film-header">
        <Wordmark /><span>YOUR COLOR, WITH CONTEXT</span>
        <div className="beat-dots">{Array.from({ length: total }, (_, n) => <i key={n} className={n === index ? "active" : ""} />)}</div>
      </header>
      <div className="copy" style={{ opacity: enter, transform: `translateY(${(1 - enter) * 32}px)` }}>
        <p className="eyebrow">{beat.eyebrow}</p>
        <h1>{beat.headline}<em>{beat.accent}</em></h1>
        <p className="detail">{beat.detail}</p>
        {beat.id === "close" && <>
          <div className="visit">dyecast.vercel.app <span>&#8599;</span></div>
          <p className="safety">Follow the box instructions.<br />Allergy alert test. Strand test.</p>
        </>}
        {beat.id === "profile" && <div className="tags"><span>No photo required</span><span>Your choices drive the forecast</span></div>}
        {beat.id === "choose" && <div className="tags"><span>Change</span><span>Upkeep</span><span>Undertone</span></div>}
        {beat.id === "why" && <div className="tags"><span>Lift limits</span><span>Warmth</span><span>Color history</span></div>}
        {beat.id === "buy" && <div className="tags"><span>Real shades</span><span>Source links</span><span>No affiliate links</span></div>}
      </div>
      <div className="media">{media}</div>
      <footer className="film-footer">
        <span className="caption">{beat.caption}</span>
        <span className="source">
          {["profile", "try", "reality"].includes(beat.id) ? "NASA public-domain demo portrait | Illustrative try-on, no endorsement" : "Rule-based educational forecast | Results vary"}
        </span>
      </footer>
      <div className="timeline-progress" style={{ width: `${(frame / (beat.seconds * fps)) * 100}%` }} />
    </AbsoluteFill>
  );
}

export function DyeCastFilm({ short }: { short: boolean }) {
  const { fps, durationInFrames } = useVideoConfig();
  const beats = short ? SHORT_BEATS : FULL_BEATS;
  const [fontHandle] = useState(() => delayRender("Loading DyeCast's brand fonts"));
  useEffect(() => {
    Promise.all([
      document.fonts.load('500 80px "Fraunces Variable"'),
      document.fonts.load('400 32px "Geist Variable"'),
    ]).then(() => continueRender(fontHandle)).catch((error: unknown) => cancelRender(error));
  }, [fontHandle]);
  return (
    <AbsoluteFill style={{ background: "#fbf8f3" }}>
      <Audio src={staticFile("audio/score.wav")} volume={(frame) => interpolate(
        frame, [0, fps * 2, durationInFrames - fps * 3, durationInFrames - 1], [0, 0.65, 0.65, 0], clamp,
      )} />
      {beats.map((beat, index) => {
        const from = beats.slice(0, index).reduce((sum, item) => sum + item.seconds * fps, 0);
        return <Sequence key={beat.id} from={from} durationInFrames={beat.seconds * fps}>
          <Scene beat={beat} index={index} total={beats.length} />
        </Sequence>;
      })}
    </AbsoluteFill>
  );
}
