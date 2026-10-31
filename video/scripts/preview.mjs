import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const release = process.argv.includes("--release");
const assetDirectory = release ? "release" : "footage";
const story = JSON.parse(await readFile(join(root, "src", "beats.json"), "utf8"));
const stylesheet = await readFile(join(root, "src", "style.css"), "utf8");
const escape = (text) => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const cache = new Map();
async function image(name, className = "", style = "") {
  if (!cache.has(name)) {
    const bytes = await readFile(join(root, "public", assetDirectory, name));
    cache.set(name, `data:image/${name.endsWith(".png") ? "png" : "jpeg"};base64,${bytes.toString("base64")}`);
  }
  return `<img src="${cache.get(name)}" class="${className}" style="${style}" alt="${escape(name)}">`;
}

let fonts = "";
const licenses = [];
for (const [slug, family] of [["fraunces", "Fraunces Variable"], ["geist", "Geist Variable"]]) {
  const directory = join(root, "node_modules", "@fontsource-variable", slug);
  const files = await readdir(join(directory, "files"));
  for (const style of ["normal", "italic"]) {
    const file = files.find((name) => name.startsWith(`${slug}-latin-wght-`) && name.endsWith(`-${style}.woff2`));
    if (!file && style === "normal") throw new Error(`Missing ${family} font.`);
    if (!file) continue;
    const data = await readFile(join(directory, "files", file));
    fonts += `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${data.toString("base64")}) format("woff2");font-style:${style};font-weight:100 900;}`;
  }
  const licenseFile = (await readdir(directory)).find((name) => /^(license|ofl)/i.test(name));
  if (!licenseFile) throw new Error(`Missing redistribution license for ${family}.`);
  licenses.push(`${family}\n${await readFile(join(directory, licenseFile), "utf8")}`);
}

async function capture(file, phoneFile, alternate) {
  return `<div class="capture"><div class="browser-bar"><div class="browser-dots"><span></span><span></span><span></span></div><span>dyecast.vercel.app</span><span class="live-mark">REAL APP</span></div><div class="capture-screen">
    ${await image(file, phoneFile ? "desktop-asset" : "")}
    ${phoneFile ? await image(phoneFile, "phone-asset") : ""}
    ${alternate ? await image(alternate, "alternate-asset desktop-asset", "position:absolute;inset:0;opacity:0") : ""}
  </div></div>`;
}

async function photoStrip(device = false) {
  const panels = device
    ? [["device-today.jpg", "Today"], ["device-honey.jpg", "Honey blonde"], ["device-caramel.jpg", "Caramel brown"], ["device-copper.jpg", "Copper red"]]
    : [["photo-today.jpg", "Today"], ["photo-box.jpg", "The box"], ["photo-likely.jpg", "Your forecast"]];
  return `<div class="photo-strip${device ? " trial-strip" : ""}">${(await Promise.all(panels.map(async ([name, label]) =>
    `<figure>${await image(name)}<figcaption>${label}</figcaption></figure>`))).join("")}</div>`;
}

// The four YouCam feature APIs DyeCast calls (the slugs are the real task endpoints used by src/lib/youcam).
function youcamMap() {
  const apis = [
    ["01", "AI Facial Color Tones Analyzer", "Double-checks your starting color and reads your undertone", "skin-tone-analysis"],
    ["02", "AI Hair Length Detection", "Suggests your length, which sets how many boxes you need", "hair-length-detection"],
    ["03", "AI Hair Density Detection", "Reads density from a hairline photo for the box count", "hair-density-detection"],
    ["04", "AI Hair Color Virtual Try-On", "Renders the box promise and your likely result on your photo", "hair-color"],
  ];
  return `<div class="api-map"><div class="api-flow">
    <span>Your photo<small>cleaned on your device</small></span><i>&rarr;</i>
    <span class="api-hub">YouCam API<small>four feature APIs</small></span><i>&rarr;</i>
    <span class="api-engine">DyeCast forecast<small>color chemistry</small></span><i>&rarr;</i>
    <span>Your reality check<small>box vs. your hair</small></span>
  </div><div class="api-cards">${apis.map(([number, title, text, slug]) =>
    `<div><b>${number}</b><p><strong>${title}</strong><span>${text}</span></p><code>${slug}</code></div>`).join("")}</div></div>`;
}

async function compare() {
  return `<div class="hair-compare">${await image("swatch-likely.png", "macro-hair")}${await image("swatch-box.png", "macro-hair before-hair", "clip-path:inset(0 50% 0 0)")}<div class="hair-shade"></div><span class="compare-label left">Box promise</span><span class="compare-label right">Likely on your hair</span><div class="compare-divider" style="left:50%"><span>&lt; &gt;</span></div><div class="compare-bottom">Actual app forecast / shade 9.1</div><input class="preview-slider" type="range" min="5" max="95" value="50" aria-label="Compare box and likely result"></div>`;
}

const sections = [];
for (const [index, beat] of story.beats.entries()) {
  let media;
  switch (beat.id) {
    case "hook": media = await compare(); break;
    case "profile": media = await capture("profile.png", "photo-assist.png"); break;
    case "choose": media = await capture("choose-cards.png", "choose-best.png", "choose-alternate.png"); break;
    case "try": media = release ? await photoStrip(true) : await capture("try-colors.png", "try-colors-phone.png"); break;
    case "reality": media = `<div class="reality-compare">${await compare()}</div><div class="reality-photos">${await photoStrip()}</div>`; break;
    case "youcam": media = youcamMap(); break;
    case "why": media = await capture("why.png"); break;
    case "buy": media = await capture("products.png", undefined, "plan.png"); break;
    case "privacy": media = `<div class="privacy-cards">${["Quick previews on your device", "Consent before YouCam processing", "Stored selfies off by default", "Local photos cleared at sign-out"].map((label, n) => `<div><span>0${n + 1}</span><strong>${label}</strong><b>&#10003;</b></div>`).join("")}<p>Deletion is requested after delivery and retried if unconfirmed.</p></div>`; break;
    case "close": media = `<div class="closing-hair">${await image("swatch-likely.png")}<div></div></div>`; break;
    default: throw new Error(`Unsupported preview scene: ${beat.id}`);
  }
  const source = ["profile", "try", "reality"].includes(beat.id) ? "NASA public-domain demo portrait | Illustrative try-on, no endorsement"
    : beat.id === "youcam" ? "YouCam API integration in the live DyeCast app" : "Rule-based educational forecast | Results vary";
  sections.push(`<section class="scene landscape scene-${beat.id}${beat.id === "close" ? " dark" : ""}" data-seconds="${beat.seconds}" ${index ? "hidden" : ""}>
    <div class="background-orbit orbit-one"></div><div class="background-orbit orbit-two"></div>
    <header class="film-header"><span class="wordmark">dye<i>cast</i><b>.</b></span><span>YOUR COLOR, WITH CONTEXT</span><div class="powered">POWERED BY <strong>YOUCAM API</strong></div><div class="beat-dots">${story.beats.map((_, n) => `<i class="${n === index ? "active" : ""}"></i>`).join("")}</div></header>
    <div class="copy"><p class="eyebrow">${escape(beat.eyebrow)}</p><h1>${escape(beat.headline)}<em>${escape(beat.accent)}</em></h1><p class="detail">${escape(beat.detail)}</p>${beat.api ? `<div class="tags">${beat.api.map((tag) => `<span>${escape(tag)}</span>`).join("")}</div>` : ""}${beat.id === "close" ? '<div class="visit">dyecast.vercel.app &#8599;</div><p class="built">Built with the <strong>YouCam API</strong><span>Facial Color Tones &middot; Hair Length &middot; Hair Density &middot; Hair Color Try-On</span></p><p class="safety">Follow the box instructions.<br>Allergy alert test. Strand test.</p>' : ""}</div>
    <div class="media">${media}</div><footer class="film-footer"><span class="caption">${escape(beat.caption)}</span><span class="source">${source}</span></footer>
  </section>`);
}
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DyeCast - visual preview</title><style>${fonts}${stylesheet}
html,body{background:#ece5dc;color:#241e19;font-family:"Geist Variable",sans-serif}
.preview-top{padding:20px 28px;display:flex;align-items:center;gap:18px;font-size:15px;flex-wrap:wrap}
.preview-top strong{font-size:21px}.preview-top span{color:#79695b}.preview-top a{color:#8a4530}
.preview-stage{position:relative;margin:0 auto;overflow:hidden;background:#fbf8f3;box-shadow:0 15px 50px #45210f25;border-radius:14px}
#film{position:absolute;left:0;top:0;transform-origin:0 0}.scene{position:absolute;inset:0}.scene[hidden]{display:none}
.phone-asset{display:none!important}.portrait .desktop-asset{display:none!important}.portrait .phone-asset{display:block!important}
.alternate-asset{object-position:top}.reality-compare{display:none;width:100%;height:100%}.reality-photos{width:100%}
.trial-strip{gap:12px}.trial-strip figure{width:calc((100% - 36px)/4)}.trial-strip img{height:390px}.trial-strip figcaption{font-size:18px}
.portrait .trial-strip{grid-template-columns:1fr 1fr}.portrait .trial-strip figure{width:auto}.portrait .trial-strip figure:nth-child(2){display:block}.portrait .trial-strip img{height:330px}.portrait .trial-strip figcaption{font-size:26px}
.preview-controls{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:22px}
button{font:500 14px "Geist Variable";padding:10px 16px;border:1px solid #d6c5b5;border-radius:9px;background:#fffaf4;color:#623d2b;cursor:pointer}button:hover{background:#f4e3d6}
#play{background:#8a4530;color:#fff;border-color:#8a4530}#counter{min-width:150px;text-align:center;font-size:14px}
.preview-notes{max-width:1000px;margin:0 auto;padding:0 24px 30px;font-size:14px;line-height:1.6;color:#79695b}.preview-notes summary{cursor:pointer}.preview-notes pre{white-space:pre-wrap;font:12px/1.5 monospace}
.preview-slider{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize}
.copy,.capture,.hair-compare,.photo-strip,.privacy-cards{animation:appear .5s ease-out both}
@keyframes appear{from{opacity:0;translate:0 18px}to{opacity:1;translate:0 0}}
</style></head><body><div class="preview-top"><strong>DyeCast visual draft</strong><span>Real app screens. No personal photos. Not an MP4.</span><a href="https://dyecast.vercel.app" target="_blank" rel="noreferrer">Open the app</a></div>
<div class="preview-stage" id="stage"><div id="film">${sections.join("")}</div></div>
<div class="preview-controls"><button id="prev">Previous</button><button id="play">Play storyboard</button><span id="counter"></span><button id="next">Next</button><button id="layout">Phone layout</button></div>
<div class="preview-notes"><p>This is an offline design preview of the prepared 105-second film. The animated Remotion composition has not been rendered to MP4 because this session blocks localhost connections. Music and captions are prepared; AI narration is pending.</p>
<details><summary>Proposed narration</summary>${story.beats.map((b) => `<p><strong>${escape(b.eyebrow)}</strong><br>${escape(b.narration)}</p>`).join("")}</details>
<details><summary>Public-domain demo image and font credits</summary><p>Portrait: NASA / Bill Stafford, Loral O'Hara official portrait. Public domain. Illustrative try-on; no endorsement. <a href="https://commons.wikimedia.org/wiki/File:Loral_O%27Hara_official_portrait.jpg">Source</a>. Hair texture: Kefi, Hair01.JPG, Wikimedia Commons, public domain. Frames are from the real DyeCast app.</p><pre>${escape(licenses.join("\n\n"))}</pre></details></div>
<script>
const film=document.getElementById("film"),stage=document.getElementById("stage");
const slides=Array.from(document.querySelectorAll(".scene"));let current=0,phone=false,timer=null;
function resize(){const w=phone?1080:1920,h=phone?1920:1080;const scale=Math.min((innerWidth-40)/w,(innerHeight-185)/h);const s=Math.max(.15,scale);film.style.width=w+"px";film.style.height=h+"px";film.style.transform="scale("+s+")";stage.style.width=w*s+"px";stage.style.height=h*s+"px";}
function show(n){current=(n+slides.length)%slides.length;slides.forEach((s,i)=>{s.hidden=i!==current;s.classList.toggle("portrait",phone);s.classList.toggle("landscape",!phone);});document.getElementById("counter").textContent=(current+1)+" / "+slides.length+" - "+slides[current].dataset.seconds+"s";resize();if(timer){clearTimeout(timer);timer=setTimeout(()=>show(current+1),Number(slides[current].dataset.seconds)*1000);}}
document.getElementById("next").onclick=()=>show(current+1);document.getElementById("prev").onclick=()=>show(current-1);
document.getElementById("layout").onclick=()=>{phone=!phone;document.getElementById("layout").textContent=phone?"Desktop layout":"Phone layout";show(current);};
document.getElementById("play").onclick=()=>{if(timer){clearTimeout(timer);timer=null;document.getElementById("play").textContent="Play storyboard";}else{document.getElementById("play").textContent="Pause";timer=setTimeout(()=>show(current+1),Number(slides[current].dataset.seconds)*1000);}};
document.querySelectorAll(".preview-slider").forEach(r=>r.oninput=()=>{const parent=r.closest(".hair-compare");parent.querySelector(".before-hair").style.clipPath="inset(0 "+(100-Number(r.value))+"% 0 0)";parent.querySelector(".compare-divider").style.left=r.value+"%";});
addEventListener("resize",resize);addEventListener("keydown",e=>{if(e.key==="ArrowRight")show(current+1);if(e.key==="ArrowLeft")show(current-1);});show(0);
</script></body></html>`;
await mkdir(join(root, "out"), { recursive: true });
await writeFile(join(root, "out", release ? "DyeCast-release-preview.html" : "DyeCast-preview.html"), html);
console.log("Saved a self-contained visual preview. No local server or network connection is required.");
