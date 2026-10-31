import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
let key = process.env.GEMINI_API_KEY;
if (!key) {
  const input = join(root, ".env.local");
  const text = await readFile(input, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const value = /^GEMINI_API_KEY[ \t]*=[ \t]*([^\r\n]*)/m.exec(text)?.[1]?.trim();
  if (value) {
    key = value.replace(/^(['"])(.*)\1$/, "$2");
    await writeFile(input, text.replace(/^(GEMINI_API_KEY[ \t]*=)[^\r\n]*/m, "$1"));
    console.log("Temporary narration key cleared from the ignored input file.");
  }
}
if (!key || key.length < 20) throw new Error("Supply GEMINI_API_KEY using the hidden prompt or the ignored video/.env.local input.");
const model = "gemini-3.8-flash-tts";
const voice = "Sulafat";
const directory = join(root, "public", "audio", "voice");
const story = JSON.parse(await readFile(join(root, "src", "beats.json"), "utf8"));
await mkdir(directory, { recursive: true });

function wavInfo(bytes) {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Gemini did not return the documented WAV audio output.");
  }
  let sampleRate, channels, bits, length;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = bytes.toString("ascii", at, at + 4);
    const declared = bytes.readUInt32LE(at + 4);
    const available = Math.min(declared, bytes.length - at - 8);
    if (id === "fmt " && available >= 16) {
      channels = bytes.readUInt16LE(at + 10);
      sampleRate = bytes.readUInt32LE(at + 12);
      bits = bytes.readUInt16LE(at + 22);
    }
    if (id === "data") length = available;
    at += 8 + declared + (declared % 2);
  }
  if (!sampleRate || !channels || !bits || !length) throw new Error("Generated narration has an invalid WAV header.");
  return { seconds: length / (sampleRate * channels * bits / 8), sampleRate, channels };
}

async function synthesize(text) {
  for (let attempt = 0; attempt < 4; attempt++) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model,
      input: [{
        type: "user_input",
        content: [{
          type: "text", text,
          annotations: [{
            type: "speech_metadata",
            style: "Warm, confident English product-demo narrator. Natural, clear, conversational delivery. Medium pace, with short pauses. Read only the supplied transcript. DyeCast is pronounced dye cast. No music or sound effects.",
          }],
        }],
      }],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice }] },
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if ([429, 502, 503, 504].includes(response.status) && attempt < 3) {
      const header = Number(response.headers.get("retry-after"));
      const seconds = Number.isFinite(header) && header > 0 ? Math.min(header, 120) : 60;
      console.log(`Gemini is throttling narration (HTTP ${response.status}); waiting ${seconds}s before retry ${attempt + 1}/3.`);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      continue;
    }
    // Neither request headers nor raw provider messages are logged.
    throw new Error(`Gemini narration failed: HTTP ${response.status}, ${data?.error?.status ?? "provider_error"}. Check the key, TTS access and quota.`);
  }
  const data = await response.json();
  const audio = data.steps?.filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? []).filter((item) => item.type === "audio").at(-1);
  if (!audio?.data) throw new Error("Gemini completed without an audio block. No silent voice placeholder will be used.");
  return Buffer.from(audio.data, "base64");
  }
  throw new Error("Gemini narration could not be completed after bounded retries.");
}

const clips = [];
for (const [index, beat] of story.beats.entries()) {
  const textHash = createHash("sha256").update(beat.narration).digest("hex");
  const file = `${beat.id}.wav`;
  const metaPath = join(directory, `${beat.id}.json`);
  const previous = await readFile(metaPath, "utf8").then(JSON.parse).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  console.log(`Narration ${index + 1}/${story.beats.length}: ${beat.id}`);
  let bytes;
  if (previous?.textHash === textHash && previous.model === model && previous.voice === voice) {
    bytes = await readFile(join(directory, file));
  } else {
    bytes = await synthesize(beat.narration);
    wavInfo(bytes);
    await writeFile(join(directory, file), bytes);
    await writeFile(metaPath, JSON.stringify({ textHash, model, voice }));
    if (index < story.beats.length - 1) {
      console.log("Pacing the next narration request to stay within Gemini rate limits.");
      await new Promise((resolve) => setTimeout(resolve, 22000));
    }
  }
  const info = wavInfo(bytes);
  if (info.seconds < 1 || info.seconds > 30) throw new Error(`Review the ${beat.id} narration: unexpected duration ${info.seconds.toFixed(1)}s.`);
  clips.push({ id: beat.id, file: `voice/${file}`, text: beat.narration, ...info });
}
await writeFile(join(root, "public", "audio", "narration.json"), JSON.stringify({
  generatedAt: new Date().toISOString(), model, voice,
  disclosure: "Narration: AI voice, Gemini TTS, Sulafat.",
  clips,
}, null, 2));
console.log(`Sulafat narration ready: ${clips.length} genuine voice clips. API key was not written to any file.`);
