import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
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
const reusePicture = process.argv.includes("--reuse-picture");
const fps = 30;
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
const selected = short ? story.teaser.map((item) => ({
  ...story.beats.find((beat) => beat.id === item.id), seconds: item.seconds,
})) : story.beats;
let at = 0;
const beats = selected.map((beat) => {
  const clip = narration?.clips.find((item) => item.id === beat.id);
  const seconds = Math.ceil(Math.max(beat.seconds, (clip?.seconds ?? 0) + 1.7) * fps) / fps;
  const entry = { ...beat, seconds, clip, from: at };
  at += seconds;
  return entry;
});
if (!short && (at < 60 || at > 180)) throw new Error(`The competition video must be 1–3 minutes; this timeline is ${at.toFixed(1)}s.`);
const previewFile = join(output, "DyeCast-release-preview.html");
const sourceHash = createHash("sha256").update(await readFile(previewFile)).digest("hex");

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
    window.renderDyeCastFrame = ({ id, time, seconds, phone, holdLast }) => {
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
        if (alternate) alternate.style.opacity = String(smooth((time - seconds * 0.44) / 1.1));
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
      if (id === "reality") {
        const showingPhotos = time >= Math.min(7, seconds * 0.46);
        scene.querySelector(".reality-compare").style.display = showingPhotos ? "none" : "block";
        scene.querySelector(".reality-photos").style.display = showingPhotos ? "block" : "none";
      }
      for (const [index, panel] of Array.from(scene.querySelectorAll(".photo-strip figure")).entries()) {
        const start = id === "reality" ? Math.min(7, seconds * 0.46) : 0.2;
        const progress = out((time - start - index * 0.17) / 0.7);
        panel.style.opacity = String(progress);
        panel.style.transform = `translateY(${(1 - progress) * 45}px)`;
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
      await page.evaluate((data) => window.renderDyeCastFrame(data), { id: beat.id, time: 3, seconds: beat.seconds, phone: short });
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
    if (!reusePicture) {
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
        console.log(`Rendering ${index + 1}/${beats.length}: ${beat.id} (${beat.seconds.toFixed(1)}s)`);
        for (let frame = 0; frame < Math.round(beat.seconds * fps); frame++) {
          if (encoderError) throw encoderError;
          await page.evaluate((data) => window.renderDyeCastFrame(data), {
            id: beat.id, time: frame / fps, seconds: beat.seconds, phone: short, holdLast: pictureOnly,
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
      await writeFile(join(output, `${name}-picture.json`), JSON.stringify({
        sourceHash, width, height, fps, seconds: at,
        beats: beats.map(({ id, from, seconds }) => ({ id, from, seconds })),
      }, null, 2));
      console.log(`Picture track saved: ${silent}. Narration has NOT been added yet.`);
    } else {
    let videoFilter = "";
    if (reusePicture) {
      const picture = JSON.parse(await readFile(join(output, `${name}-picture.json`), "utf8"));
      if (picture.sourceHash !== sourceHash || picture.width !== width || picture.height !== height ||
        picture.beats.length !== beats.length) throw new Error("The picture track is stale or mismatched; render it again.");
      const parts = beats.map((_, index) => `[p${index}]`).join("");
      const clips = beats.map((beat, index) => {
        const original = picture.beats[index];
        if (original.id !== beat.id || beat.seconds < original.seconds) throw new Error("Picture timeline cannot be matched to the narration.");
        return `[p${index}]trim=start=${original.from}:duration=${original.seconds},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${beat.seconds - original.seconds}[s${index}]`;
      });
      videoFilter = [`[0:v]split=${beats.length}${parts}`, ...clips,
        `${beats.map((_, index) => `[s${index}]`).join("")}concat=n=${beats.length}:v=1:a=0[picture]`].join(";") + ";";
    }
    const inputs = beats.flatMap((beat) => ["-i", join(root, "public", "audio", beat.clip.file)]);
    const voiceTracks = beats.map((beat, index) => `[${index + 2}:a]aresample=48000,adelay=${Math.round((beat.from + 0.6) * 1000)}:all=1[v${index}]`);
    const voices = beats.map((_, index) => `[v${index}]`).join("");
    const filter = [
      ...voiceTracks,
      `[1:a]aresample=48000,volume=0.055,afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(0, at - 3)}:d=3[bed]`,
      `${voices}amix=inputs=${beats.length}:duration=longest:normalize=0[voice]`,
      `[voice][bed]amix=inputs=2:duration=longest:normalize=0,atrim=duration=${at},loudnorm=I=-14:TP=-1:LRA=8[mix]`,
    ].join(";");
    const finalFile = join(output, `${name}.mp4`);
    await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", silent, "-stream_loop", "-1",
      "-i", join(root, "public", "audio", "score.wav"), ...inputs,
      "-filter_complex", videoFilter + filter, "-map", reusePicture ? "[picture]" : "0:v", "-map", "[mix]",
      ...(reusePicture ? ["-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p"] : ["-c:v", "copy"]),
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", String(at), "-movflags", "+faststart", finalFile,
    ]);
    const probe = await run(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", finalFile], { capture: true });
    const metadata = JSON.parse(probe.stdout);
    const video = metadata.streams.find((stream) => stream.codec_type === "video");
    const audio = metadata.streams.find((stream) => stream.codec_type === "audio");
    if (video?.width !== width || video?.height !== height || video.codec_name !== "h264" || audio?.codec_name !== "aac" ||
      Math.abs(Number(metadata.format.duration) - at) > 0.15) throw new Error("The exported MP4 does not match the required format and timeline.");

    const srt = beats.map((beat, index) => `${index + 1}\n${timestamp(beat.from + 0.6)} --> ${timestamp(beat.from + 0.6 + beat.clip.seconds)}\n${beat.narration}\n`).join("\n");
    await writeFile(join(output, `${name}.srt`), srt);
    const chapters = beats.map((beat) => `${String(Math.floor(beat.from / 60)).padStart(2, "0")}:${String(Math.floor(beat.from % 60)).padStart(2, "0")} ${beat.eyebrow}`).join("\n");
    await writeFile(join(output, `${name}-chapters.txt`), chapters);
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
