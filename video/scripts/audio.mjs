import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const story = JSON.parse(await readFile(join(root, "src", "beats.json"), "utf8"));
const seconds = story.beats.reduce((sum, b) => sum + b.seconds, 0);
const rate = 24000;
const samples = seconds * rate;
const wave = Buffer.alloc(44 + samples * 4);
wave.write("RIFF", 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write("WAVEfmt ", 8);
wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(2, 22);
wave.writeUInt32LE(rate, 24); wave.writeUInt32LE(rate * 4, 28); wave.writeUInt16LE(4, 32);
wave.writeUInt16LE(16, 34); wave.write("data", 36); wave.writeUInt32LE(samples * 4, 40);
const chords = [[164.81, 196, 246.94, 293.66], [174.61, 220, 261.63, 329.63], [196, 246.94, 293.66, 369.99], [146.83, 174.61, 220, 261.63]];
const melody = [493.88, 440, 392, 329.63, 392, 440, 523.25, 493.88];
for (let i = 0; i < samples; i++) {
  const t = i / rate;
  const chordTime = t % 8;
  const chord = chords[Math.floor(t / 8) % chords.length];
  const envelope = Math.min(1, chordTime / 1.2) * Math.min(1, (8 - chordTime) / 1.5);
  const noteTime = t % 1.5;
  const note = melody[Math.floor(t / 1.5) % melody.length];
  const pluck = Math.exp(-noteTime * 6) * Math.sin(t * note * Math.PI * 2) * 0.025;
  const fade = Math.min(1, t / 3, (seconds - t) / 4);
  for (let channel = 0; channel < 2; channel++) {
    let pad = 0;
    for (const f of chord) pad += Math.sin(t * (f + channel * 0.12) * Math.PI * 2) * 0.022 * envelope;
    const bass = Math.sin(t * chord[0] * Math.PI) * 0.016 * envelope;
    wave.writeInt16LE(Math.round((pad + bass + pluck) * fade * 32767), 44 + i * 4 + channel * 2);
  }
}
await mkdir(join(root, "public", "audio"), { recursive: true });
await mkdir(join(root, "out"), { recursive: true });
await writeFile(join(root, "public", "audio", "score.wav"), wave);
const stamp = (seconds) => {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
function subtitles(beats) {
  let at = 0;
  return beats.map((beat, i) => {
    const start = at; at += beat.seconds;
    return `${i + 1}\n${stamp(start)} --> ${stamp(at)}\n${beat.caption}\n`;
  }).join("\n");
}
await writeFile(join(root, "out", "DyeCast-draft.srt"), subtitles(story.beats));
const teaser = story.teaser.map((b) => ({ ...story.beats.find((v) => v.id === b.id), seconds: b.seconds }));
await writeFile(join(root, "out", "DyeCast-short.srt"), subtitles(teaser));
await writeFile(join(root, "out", "DyeCast-narration.txt"), story.beats.map((b) => `${b.eyebrow}\n${b.narration}`).join("\n\n"));
console.log(`Original music and captions prepared for ${seconds}s. Narration is not synthesized in the visual draft.`);
