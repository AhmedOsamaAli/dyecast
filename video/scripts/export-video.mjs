import { chromium } from "playwright-core";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static");
const ffprobe = require("ffprobe-static").path;
const story = JSON.parse(await readFile(join(root, "src", "beats.json"), "utf8"));
const short = process.argv.includes("--short");
const review = process.argv.includes("--review");
const pictureOnly = process.argv.includes("--picture-only");
const remix = process.argv.includes("--remix");
const fps = 30;
// Pacing: a scene is its narration plus a short lead-in and tail, so lines sit about 1.1 s apart and the music
// fills the pauses. Scenes without narration (review, picture-only) fall back to the seconds in beats.json.
const lead = 0.55;
const tail = 0.55;
const openingLead = 0.8;
const closingTail = 3.4;
// The music bed is generated at about -18 LUFS and the voice is about -16.5 LUFS. 0.25 puts the bed roughly
// 16 dB under the voice, and the compressor below pulls it down a further ~5 dB while someone is speaking.
const bedGain = 0.25;
const width = short ? 1080 : 1920;
const height = short ? 1920 : 1080;
const name = short ? "DyeCast-phone" : "DyeCast-demo";
const output = join(root, "out");
await mkdir(output, { recursive: true });

function run(command, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-12000); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`Media tool failed (${code}): ${stderr.slice(-2500)}`));
      else resolve({ stdout, stderr });
    });
  });
}

function timestamp(seconds) {
  const milliseconds = Math.round(seconds * 1000);
  return `${String(Math.floor(milliseconds / 3600000)).padStart(2, "0")}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, "0")}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")},${String(milliseconds % 1000).padStart(3, "0")}`;
}

let narration;
if (!review && !pictureOnly) {
  narration = JSON.parse(await readFile(join(root, "public", "audio", "narration.json"), "utf8"));
  if (narration.voice !== "Sulafat" || narration.clips.length !== story.beats.length) {
    throw new Error("Complete approved Sulafat narration is required. No silent placeholder will be exported.");
  }
}

// Where the speech actually starts and ends in a clip (the generated voice has about 0.2 s of silence at both
// ends), plus the pauses inside it.
async function readSpeech(clip) {
  const { stderr } = await run(ffmpeg, [
    "-hide_banner", "-nostats", "-i", join(root, "public", "audio", clip.file),
    "-af", "silencedetect=noise=-40dB:d=0.1", "-f", "null", "-",
  ]);
  const found = [];
  let open = null;
  for (const line of stderr.split(/\r?\n/)) {
    const begin = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (begin) open = Math.max(0, Number(begin[1]));
    const finish = /silence_end:\s*([\d.]+)/.exec(line);
    if (finish) {
      found.push({ start: open ?? 0, end: Number(finish[1]) });
      open = null;
    }
  }
  if (open !== null) found.push({ start: open, end: clip.seconds });
  const silences = [];
  for (const item of found) {
    const last = silences.at(-1);
    if (last && item.start - last.end < 0.03) last.end = Math.max(last.end, item.end);
    else silences.push({ ...item });
  }
  const start = silences[0]?.start <= 0.02 ? silences[0].end : 0;
  const end = silences.at(-1)?.end >= clip.seconds - 0.02 ? silences.at(-1).start : clip.seconds;
  if (!(end - start > 1)) throw new Error(`The ${clip.id} narration has no usable speech.`);
  return { start, end, pauses: silences.filter((item) => item.start > start && item.end < end) };
}

// Seconds after a line starts at which each phrase is spoken. The clip's real pauses are matched to the commas
// and full stops in the text, and the characters between two pauses are spread evenly over the time between them.
function cueOffsets(text, phrases, speech) {
  const stops = [...text.matchAll(/[.,?!;:]\s+/g)].map((match) => match.index + match[0].length);
  const spoken = speech.end - speech.start - speech.pauses.reduce((sum, item) => sum + item.end - item.start, 0);
  const anchors = [];
  let heard = 0;
  let previous = speech.start;
  let floor = 0;
  for (const pause of speech.pauses) {
    heard += pause.start - previous;
    previous = pause.end;
    const expected = (heard / spoken) * text.length;
    let best = -1;
    for (const stop of stops) {
      if (stop > floor && (best < 0 || Math.abs(stop - expected) < Math.abs(best - expected))) best = stop;
    }
    if (best >= 0 && Math.abs(best - expected) <= text.length * 0.1) {
      anchors.push({ char: best, from: pause.start, to: pause.end });
      floor = best;
    }
  }
  const spans = [];
  let char = 0;
  let time = speech.start;
  for (const anchor of anchors) {
    spans.push({ c0: char, c1: anchor.char, t0: time, t1: anchor.from });
    char = anchor.char;
    time = anchor.to;
  }
  spans.push({ c0: char, c1: text.length, t0: time, t1: speech.end });
  return phrases.map((phrase) => {
    const where = text.indexOf(phrase);
    if (where < 0) throw new Error(`The cue "${phrase}" is not in the narration.`);
    const span = spans.find((item) => where >= item.c0 && where < item.c1);
    return span.t0 + ((where - span.c0) / (span.c1 - span.c0)) * (span.t1 - span.t0) - speech.start;
  });
}

const selected = short ? story.teaser.map((item) => ({
  ...story.beats.find((beat) => beat.id === item.id), seconds: item.seconds,
})) : story.beats;
let at = 0;
const beats = [];
for (const [index, beat] of selected.entries()) {
  const clip = narration?.clips.find((item) => item.id === beat.id);
  if (clip && clip.text !== beat.narration) throw new Error(`The ${beat.id} narration changed after it was recorded. Run npm run narrate.`);
  const speech = clip ? await readSpeech(clip) : undefined;
  const before = index === 0 ? openingLead : lead;
  const after = index === selected.length - 1 ? closingTail : tail;
  const seconds = speech ? Math.ceil((before + speech.end - speech.start + after) * fps) / fps : beat.seconds;
  const phrases = beat.cues ?? [];
  const cues = speech
    ? cueOffsets(beat.narration, phrases, speech).map((offset) => before + offset)
    : phrases.map((_, n) => seconds * (0.25 + (0.5 * n) / Math.max(1, phrases.length - 1)));
  beats.push({ ...beat, seconds, clip, speech, lead: before, cues, from: at });
  at += seconds;
}
if (!short && (at < 60 || at > 180)) throw new Error(`The competition video must be 1–3 minutes; this timeline is ${at.toFixed(1)}s.`);
const previewFile = join(output, "DyeCast-release-preview.html");

// A file URL and embedded media only. This exporter never opens a localhost HTTP/WebSocket service.
const browser = await chromium.launch({
  ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}),
});
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.route(/^https?:/, (route) => route.abort());
try {
  await page.goto(pathToFileURL(previewFile).href, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, (image) => image.decode()));
  });
  await page.addStyleTag({ content: `
    .preview-top,.preview-controls,.preview-notes{display:none!important}
    html,body{margin:0!important;width:${width}px;height:${height}px;overflow:hidden}
    #stage{position:absolute!important;inset:0!important;width:${width}px!important;height:${height}px!important;margin:0;border-radius:0;box-shadow:none}
    #film{width:${width}px!important;height:${height}px!important;transform:none!important}
    *,*::before,*::after{animation:none!important;transition:none!important}
    .preview-slider{display:none!important}
  ` });
  await page.evaluate(() => {
    const clamp = (value) => Math.max(0, Math.min(1, value));
    const out = (value) => 1 - (1 - clamp(value)) ** 3;
    const smooth = (value) => { const t = clamp(value); return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2; };
    window.renderDyeCastFrame = ({ id, time, seconds, phone, holdLast, cues = [] }) => {
      const scenes = Array.from(document.querySelectorAll(".scene"));
      for (const scene of scenes) {
        const active = scene.classList.contains(`scene-${id}`);
        scene.hidden = !active;
        scene.classList.toggle("portrait", phone);
        scene.classList.toggle("landscape", !phone);
      }
      const scene = scenes.find((item) => !item.hidden);
      if (!scene) throw new Error(`Missing film scene ${id}`);
      scene.style.opacity = String(Math.min(out(time / 0.3), holdLast ? 1 : clamp((seconds - time) / 0.2)));
      const copy = scene.querySelector(".copy");
      const enter = out((time - 0.1) / 0.7);
      copy.style.opacity = String(enter);
      copy.style.transform = `translateY(${(1 - enter) * 32}px)`;
      const capture = scene.querySelector(".capture");
      if (capture) {
        const progress = out((time - 0.2) / 0.85);
        capture.style.opacity = String(progress);
        capture.style.transform = `perspective(2200px) translateY(${(1 - progress) * 55}px) rotateY(${phone ? 0 : (1 - progress) * -6}deg) scale(${1 + 0.018 * clamp(time / seconds)})`;
        const alternate = capture.querySelector(".alternate-asset");
        if (alternate) alternate.style.opacity = String(smooth((time - (cues[0] ?? seconds * 0.44) + 0.25) / 1.1));
      }
      const compare = scene.querySelector(".hair-compare");
      if (compare) {
        const keys = [[0, 50], [1.8, 50], [3.6, 78], [5.5, 22], [8, 50]];
        let split = 50;
        for (let index = 0; index < keys.length - 1; index++) {
          const [start, a] = keys[index], [end, b] = keys[index + 1];
          if (time >= start && time <= end) split = a + (b - a) * smooth((time - start) / (end - start));
        }
        compare.querySelector(".before-hair").style.clipPath = `inset(0 ${100 - split}% 0 0)`;
        compare.querySelector(".compare-divider").style.left = `${split}%`;
      }
      const photosAt = (cues[0] ?? Math.min(7, seconds * 0.46)) - 0.1;
      if (id === "reality") {
        const showingPhotos = time >= photosAt;
        scene.querySelector(".reality-compare").style.display = showingPhotos ? "none" : "block";
        scene.querySelector(".reality-photos").style.display = showingPhotos ? "block" : "none";
      }
      for (const [index, panel] of Array.from(scene.querySelectorAll(".photo-strip figure")).entries()) {
        const start = id === "reality" ? photosAt : 0.2;
        const progress = out((time - start - index * 0.17) / 0.7);
        panel.style.opacity = String(progress);
        panel.style.transform = `translateY(${(1 - progress) * 45}px)`;
      }
      const map = scene.querySelector(".api-map");
      if (map) {
        // Cues 0-3 are the four APIs as they are spoken; cue 4 is "YouCam sees your hair" and cue 5 "DyeCast forecasts".
        for (const [index, node] of Array.from(map.querySelectorAll(".api-flow > *")).entries()) {
          const progress = out((time - 0.25 - index * 0.1) / 0.5);
          node.style.opacity = String(progress);
          node.style.transform = `translateY(${(1 - progress) * 18}px)`;
        }
        const recap = time >= cues[4] - 0.05;
        for (const [index, card] of Array.from(map.querySelectorAll(".api-cards > div")).entries()) {
          const progress = out((time - (cues[index] - 0.3)) / 0.5);
          const active = time >= cues[index] - 0.05 && time < cues[index + 1] - 0.05;
          card.classList.toggle("active", active);
          card.style.opacity = String(progress * (active || recap ? 1 : 0.6));
          card.style.transform = `translateX(${(1 - progress) * 60}px)`;
        }
        map.querySelector(".api-hub").classList.toggle("lit", recap);
        map.querySelector(".api-engine").classList.toggle("lit", time >= cues[5] - 0.05);
      }
      for (const [index, card] of Array.from(scene.querySelectorAll(".privacy-cards > div")).entries()) {
        const progress = out((time - index * 0.42 - 0.1) / 0.65);
        card.style.opacity = String(progress);
        card.style.transform = `translateX(${(1 - progress) * 50}px)`;
      }
    };
  });

  if (review) {
    const frames = [];
    for (const beat of beats) {
      const time = beat.cues.length ? Math.min(beat.seconds - 0.4, beat.cues.at(-1) + 1) : 3;
      await page.evaluate((data) => window.renderDyeCastFrame(data), { id: beat.id, time, seconds: beat.seconds, phone: short, cues: beat.cues });
      await page.screenshot({ path: join(output, `${name}-review-${beat.id}.png`) });
      const check = await page.locator(".scene:not([hidden])").evaluate((scene) => {
        const copy = scene.querySelector(".copy").getBoundingClientRect();
        const media = scene.querySelector(".media").getBoundingClientRect();
        return {
          loadedImages: Array.from(scene.images ?? scene.querySelectorAll("img")).every((image) => image.complete && image.naturalWidth > 0),
          overlapping: copy.left < media.right && copy.right > media.left && copy.top < media.bottom && copy.bottom > media.top,
        };
      });
      if (!check.loadedImages || check.overlapping) throw new Error(`Review failed: ${beat.id} has missing media or overlapping text.`);
      frames.push({ id: beat.id, ...check });
    }
    if (pageErrors.length) throw new Error(pageErrors[0]);
    await writeFile(join(output, `${name}-review.json`), JSON.stringify({ width, height, frames, noNetworkService: true }, null, 2));
    console.log(`Reviewed ${frames.length} ${short ? "phone" : "desktop"} scenes, with all media loaded and no text overlaps.`);
  } else {
    const silent = join(output, `${name}-picture.mp4`);
    if (remix) {
      const probe = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", silent], { capture: true });
      if (Math.abs(Number(probe.stdout) - at) > 0.1) throw new Error("The saved picture track does not match this timeline. Run a full export.");
    } else {
      const encoder = spawn(ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-vcodec", "mjpeg",
        "-framerate", String(fps), "-i", "pipe:0", "-an", "-c:v", "libx264", "-preset", "fast",
        "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent,
      ], { stdio: ["pipe", "ignore", "pipe"] });
      let encoderError, stderr = "";
      encoder.on("error", (error) => { encoderError = error; });
      encoder.stdin.on("error", (error) => { encoderError = error; });
      encoder.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-6000); });
      const exit = once(encoder, "close");
      try {
        for (const [index, beat] of beats.entries()) {
          console.log(`Rendering ${index + 1}/${beats.length}: ${beat.id} (${beat.seconds.toFixed(1)}s${beat.cues.length ? `, cues ${beat.cues.map((cue) => cue.toFixed(1)).join(" ")}` : ""})`);
          for (let frame = 0; frame < Math.round(beat.seconds * fps); frame++) {
            if (encoderError) throw encoderError;
            await page.evaluate((data) => window.renderDyeCastFrame(data), {
              id: beat.id, time: frame / fps, seconds: beat.seconds, phone: short, cues: beat.cues,
              holdLast: pictureOnly || index === beats.length - 1,
            });
            const jpeg = await page.screenshot({ type: "jpeg", quality: 95 });
            if (!encoder.stdin.write(jpeg)) await once(encoder.stdin, "drain");
          }
        }
        encoder.stdin.end();
        const [code] = await exit;
        if (code !== 0) throw new Error(`MP4 encoding failed: ${stderr}`);
      } catch (error) {
        encoder.stdin.destroy();
        encoder.kill();
        await exit.catch(() => {});
        throw error;
      }
    }
    if (pageErrors.length) throw new Error(pageErrors[0]);

    if (pictureOnly) {
      console.log(`Picture track saved: ${silent}. Narration has NOT been added yet.`);
    } else {
    const inputs = beats.flatMap((beat) => ["-i", join(root, "public", "audio", beat.clip.file)]);
    // Each clip is cut to its speech (plus a short margin), so the gaps between lines are the lead and tail set above.
    const voiceTracks = beats.map((beat, index) => {
      const from = Math.max(0, beat.speech.start - 0.05);
      const to = Math.min(beat.clip.seconds, beat.speech.end + 0.08);
      const delay = Math.round((beat.from + beat.lead - (beat.speech.start - from)) * 1000);
      return `[${index + 2}:a]atrim=start=${from.toFixed(3)}:end=${to.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,pan=stereo|c0=c0|c1=c0,adelay=${delay}:all=1[v${index}]`;
    });
    const voices = beats.map((_, index) => `[v${index}]`).join("");
    const filter = [
      ...voiceTracks,
      `[1:a]aresample=48000,volume=${bedGain},afade=t=in:st=0:d=2.5,afade=t=out:st=${Math.max(0, at - 4)}:d=4[bed]`,
      `${voices}amix=inputs=${beats.length}:duration=longest:normalize=0,asplit=2[voice][key]`,
      "[key]apad[sidechain]",
      "[bed][sidechain]sidechaincompress=threshold=0.05:ratio=2.5:attack=40:release=800:makeup=1[ducked]",
      `[voice][ducked]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-14:TP=-2:LRA=9[mix]`,
    ].join(";");
    const finalFile = join(output, `${name}.mp4`);
    await writeFile(join(output, `${name}-audio-filter.txt`), filter.replaceAll(";", ";\n"));
    await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", silent, "-stream_loop", "-1",
      "-i", join(root, "public", "audio", "score.wav"), ...inputs,
      "-filter_complex", filter, "-map", "0:v", "-map", "[mix]", "-c:v", "copy",
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-t", String(at), "-movflags", "+faststart", finalFile,
    ]);
    const probe = await run(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", finalFile], { capture: true });
    const metadata = JSON.parse(probe.stdout);
    const video = metadata.streams.find((stream) => stream.codec_type === "video");
    const audio = metadata.streams.find((stream) => stream.codec_type === "audio");
    if (video?.width !== width || video?.height !== height || video.codec_name !== "h264" || audio?.codec_name !== "aac" ||
      Math.abs(Number(metadata.format.duration) - at) > 0.15) throw new Error("The exported MP4 does not match the required format and timeline.");

    const srt = beats.map((beat, index) => `${index + 1}\n${timestamp(beat.from + beat.lead)} --> ${timestamp(beat.from + beat.lead + beat.speech.end - beat.speech.start)}\n${beat.narration}\n`).join("\n");
    await writeFile(join(output, `${name}.srt`), srt);
    // YouTube only accepts chapters that are at least 10 s long, so a short scene joins the chapter before it.
    const chapters = [];
    for (const beat of beats) {
      if (!chapters.length || beat.from - chapters.at(-1).from >= 10) chapters.push({ from: beat.from, title: beat.eyebrow });
    }
    await writeFile(join(output, `${name}-chapters.txt`), chapters.map((chapter) => `${String(Math.floor(chapter.from / 60)).padStart(2, "0")}:${String(Math.floor(chapter.from % 60)).padStart(2, "0")} ${chapter.title}`).join("\n"));
    await writeFile(join(output, `${name}-export.json`), JSON.stringify({
      width, height, fps, seconds: at, audio: "Gemini TTS Sulafat + original generated score",
      source: "Approved design, genuine app captures and API output, with documented editorial crops/redactions",
      method: "File-only frame capture and FFmpeg; no localhost HTTP/WebSocket connection", metadata,
      beats: beats.map(({ id, from, seconds }) => ({ id, from, seconds })),
    }, null, 2));
    console.log(`Verified final MP4: ${finalFile} (${at.toFixed(1)}s, ${width}x${height}, with Sulafat narration).`);
    }
  }
} finally {
  await browser.close();
}
