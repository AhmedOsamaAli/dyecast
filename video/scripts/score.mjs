import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// An original, generated background score: a warm pad, a soft plucked arpeggio, a quiet bass and a light room
// reverb. It is synthesized sample by sample here, so no recording and no existing music is used.
const root = fileURLToPath(new URL("..", import.meta.url));
const rate = 48000;
const seconds = 170;
const bar = (60 / 76) * 4;
const total = Math.round(seconds * rate);
const left = new Float32Array(total);
const right = new Float32Array(total);
const bass = new Float32Array(total);
const TAU = Math.PI * 2;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const smooth = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

// MIDI notes. Each chord has a bass note and four pad notes that move by small steps.
const chords = {
  C: { bass: 36, notes: [52, 55, 59, 62] },
  Am: { bass: 45, notes: [52, 55, 59, 60] },
  F: { bass: 41, notes: [53, 57, 60, 64] },
  G: { bass: 43, notes: [55, 60, 62, 65] },
  Em: { bass: 40, notes: [52, 55, 59, 62] },
};
const progression = ["C", "Am", "F", "G", "F", "G", "Em", "Am"].map((name) => chords[name]);
const pattern = [0, 2, 1, 3, 2, 3, 1, 2];
const velocity = [1, 0.55, 0.7, 0.6, 0.85, 0.55, 0.65, 0.5];
const pan = [-0.35, 0.3, -0.15, 0.4, -0.4, 0.15, -0.25, 0.35];

function padNote(start, length, midi, gain) {
  const f = hz(midi);
  const from = Math.round(start * rate);
  const to = Math.min(total, Math.round((start + length) * rate));
  const sway = (midi % 7) * 0.9;
  for (let i = from; i < to; i++) {
    const t = (i - from) / rate;
    const env = smooth(t / 1.0) * smooth((length - t) / 1.8) * (1 + 0.07 * Math.sin(TAU * 0.17 * t + sway));
    let l = 0;
    let r = 0;
    for (const [k, amount] of [[1, 1], [2, 0.28], [3, 0.09]]) {
      l += amount * Math.sin(TAU * f * 0.9975 * k * t);
      r += amount * Math.sin(TAU * f * 1.0025 * k * t);
    }
    left[i] += l * env * gain;
    right[i] += r * env * gain;
  }
}

function pluck(start, midi, gain, position) {
  const f = hz(midi);
  const from = Math.round(start * rate);
  const to = Math.min(total, from + Math.round(2.6 * rate));
  for (let i = from; i < to; i++) {
    const t = (i - from) / rate;
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 3.2);
    const phase = TAU * f * t;
    const tone = Math.sin(phase + 1.3 * Math.exp(-t * 7) * Math.sin(phase)) + 0.22 * Math.exp(-t * 6) * Math.sin(2 * phase);
    left[i] += tone * env * gain * (1 - position);
    right[i] += tone * env * gain * (1 + position);
  }
}

function bassNote(start, length, midi, gain) {
  const f = hz(midi);
  const from = Math.round(start * rate);
  const to = Math.min(total, Math.round((start + length) * rate));
  for (let i = from; i < to; i++) {
    const t = (i - from) / rate;
    const env = smooth(t / 0.08) * smooth((length - t) / 0.9);
    bass[i] += (Math.sin(TAU * f * t) + 0.2 * Math.sin(TAU * 2 * f * t)) * env * gain;
  }
}

const bars = Math.ceil(seconds / bar);
for (let b = 0; b < bars; b++) {
  const chord = progression[b % progression.length];
  const start = b * bar;
  for (const midi of chord.notes) padNote(start, bar + 1.6, midi, 0.06);
  bassNote(start, bar + 0.4, chord.bass, 0.07);
  if (b < 2) continue;
  const entrance = smooth((b - 2) / 4);
  for (let k = 0; k < 8; k++) {
    pluck(start + (k * bar) / 8, chord.notes[pattern[k]] + 12, 0.16 * velocity[k] * (0.4 + 0.6 * entrance), pan[k]);
  }
}

class Comb {
  constructor(size, feedback, damp) {
    this.buffer = new Float32Array(size);
    this.index = 0;
    this.feedback = feedback;
    this.damp = damp;
    this.store = 0;
  }
  process(input) {
    const out = this.buffer[this.index];
    this.store = out * (1 - this.damp) + this.store * this.damp;
    this.buffer[this.index] = input + this.store * this.feedback;
    if (++this.index >= this.buffer.length) this.index = 0;
    return out;
  }
}

class Allpass {
  constructor(size) {
    this.buffer = new Float32Array(size);
    this.index = 0;
  }
  process(input) {
    const buffered = this.buffer[this.index];
    this.buffer[this.index] = input + buffered * 0.5;
    if (++this.index >= this.buffer.length) this.index = 0;
    return buffered - input;
  }
}

const scale = rate / 44100;
const combs = (spread) => [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((n) => new Comb(Math.round((n + spread) * scale), 0.86, 0.22));
const allpasses = (spread) => [556, 441, 341, 225].map((n) => new Allpass(Math.round((n + spread) * scale)));
const combsL = combs(0);
const combsR = combs(23);
const allpassL = allpasses(0);
const allpassR = allpasses(23);
const wetL = new Float32Array(total);
const wetR = new Float32Array(total);
for (let i = 0; i < total; i++) {
  const input = (left[i] + right[i]) * 0.05;
  let l = 0;
  let r = 0;
  for (const comb of combsL) l += comb.process(input);
  for (const comb of combsR) r += comb.process(input);
  for (const stage of allpassL) l = stage.process(l);
  for (const stage of allpassR) r = stage.process(r);
  wetL[i] = l;
  wetR[i] = r;
}

const rms = (a, b) => Math.sqrt((a.reduce((sum, v) => sum + v * v, 0) + b.reduce((sum, v) => sum + v * v, 0)) / (a.length + b.length));
const wetGain = (0.5 * rms(left, right)) / rms(wetL, wetR);
for (let i = 0; i < total; i++) {
  left[i] += wetL[i] * wetGain + bass[i];
  right[i] += wetR[i] * wetGain + bass[i];
}

// Settle the level at -20 dBFS RMS (ignoring the first and last seconds) so the video mix can use one fixed gain.
const body = [left.subarray(4 * rate, total - 4 * rate), right.subarray(4 * rate, total - 4 * rate)];
const level = 0.1 / rms(body[0], body[1]);
let peak = 0;
const wave = Buffer.alloc(44 + total * 4);
wave.write("RIFF", 0);
wave.writeUInt32LE(wave.length - 8, 4);
wave.write("WAVEfmt ", 8);
wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20);
wave.writeUInt16LE(2, 22);
wave.writeUInt32LE(rate, 24);
wave.writeUInt32LE(rate * 4, 28);
wave.writeUInt16LE(4, 32);
wave.writeUInt16LE(16, 34);
wave.write("data", 36);
wave.writeUInt32LE(total * 4, 40);
for (let i = 0; i < total; i++) {
  const l = Math.tanh(left[i] * level);
  const r = Math.tanh(right[i] * level);
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
  wave.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
  wave.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
}
await mkdir(join(root, "public", "audio"), { recursive: true });
await writeFile(join(root, "public", "audio", "score.wav"), wave);
console.log(`Original background score written: ${seconds}s stereo, peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS.`);
