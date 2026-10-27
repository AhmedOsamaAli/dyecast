import { levelName } from "./levels";
import { TONES, TONE_DIGITS, TONE_LETTERS } from "./tones";
import type { DecodeResult, DecodedShade, ProductType, ShadeTones, ToneId, ToneSystemId } from "./types";

type DigitSystem = Exclude<ToneSystemId, "us-letter">;

const SEPARATOR_SYSTEM: Record<string, DigitSystem> = {
  ".": "international",
  ",": "international",
  "/": "wella",
  "-": "schwarzkopf",
};

const PRODUCT_HINTS: Array<[RegExp, ProductType]> = [
  [/\bsemi\b|semi-?permanent/i, "semi"],
  [/\bdemi\b|demi-?permanent|\btoner\b|\bgloss\b|\bglaze\b/i, "demi"],
  [/high[\s-]?lift|hi[\s-]?lift|super[\s-]?lift|ultra[\s-]?lift/i, "high-lift"],
];

/** "Medium Blonde" + ash → "Medium Ash Blonde"; series 11/12 → "High-Lift …". */
export function shadeName(level: number, tones: ShadeTones, series = level): string {
  const words = levelName(level).split(" ");
  const last = words.pop() as string;
  const adjectives = [TONES[tones.primary].adjective];
  if (tones.secondary && tones.secondary !== tones.primary) adjectives.push(TONES[tones.secondary].adjective);
  const prefix = `${series > 10 ? "High-Lift " : ""}${tones.intense ? "Intense " : ""}`;
  return `${prefix}${[...words, ...adjectives, last].join(" ")}`;
}

function reverseDigits(system: DigitSystem): Partial<Record<ToneId, string>> {
  const out: Partial<Record<ToneId, string>> = {};
  for (const [digit, tone] of Object.entries(TONE_DIGITS[system])) if (!(tone in out)) out[tone] = digit;
  return out;
}

function reverseLetters(): Partial<Record<ToneId, string>> {
  const out: Partial<Record<ToneId, string>> = {};
  for (const [letter, tone] of Object.entries(TONE_LETTERS)) if (!(tone in out)) out[tone] = letter;
  return out;
}

/** Formats a code in the requested system, falling back to a system that can express the tones. */
export function formatCode(series: number, tones: ShadeTones, system: ToneSystemId = "international"): string {
  const toneList = [tones.primary, ...(tones.secondary ? [tones.secondary] : [])];
  const tryDigits = (sys: DigitSystem, sep: string): string | null => {
    const map = reverseDigits(sys);
    const digits = toneList.map((t) => map[t]);
    if (digits.some((d) => d === undefined)) return null;
    const body = tones.intense && !tones.secondary ? `${digits[0]}${digits[0]}` : digits.join("");
    return `${series}${sep}${body}`;
  };
  const tryLetters = (): string | null => {
    const map = reverseLetters();
    const letters = toneList.map((t) => map[t]);
    if (letters.some((l) => l === undefined)) return null;
    const body = tones.intense && !tones.secondary ? `${letters[0]}${letters[0]}` : letters.join("");
    return `${series}${body}`;
  };
  const separators: Record<DigitSystem, string> = { international: ".", wella: "/", schwarzkopf: "-" };
  if (system === "us-letter") return tryLetters() ?? tryDigits("international", ".") ?? `${series}`;
  return tryDigits(system, separators[system]) ?? tryDigits("international", ".") ?? tryLetters() ?? `${series}`;
}

function makeShade(series: number, tones: ShadeTones, system: ToneSystemId, code: string, note?: string): DecodedShade {
  const level = Math.min(series, 10);
  return {
    code,
    level,
    series,
    tones,
    system,
    name: shadeName(level, tones, series),
    suggestedProduct: series > 10 ? "high-lift" : undefined,
    note,
  };
}

/** Reads tone digits: "1" ash, "13" ash+gold, "11" intense ash, "01" natural with an ash hint. */
export function parseToneDigits(digits: string, system: DigitSystem): ShadeTones | null {
  if (digits === "") return { primary: "natural" };
  const map = TONE_DIGITS[system];
  const tones = [...digits].slice(0, 2).map((d) => map[d]);
  if (tones.some((t) => t === undefined)) return null;
  const [first, second] = tones as ToneId[];
  if (digits.length === 1) return { primary: first };
  if (digits[0] === digits[1]) return { primary: first, intense: true };
  if (digits[0] === "0") return { primary: "natural", secondary: second };
  return { primary: first, secondary: second };
}

/** Reads US letter suffixes: "G" gold, "NN" intense natural, "NA" natural ash, "RV" red violet. */
export function parseToneLetters(letters: string): ShadeTones | null {
  const upper = letters.toUpperCase();
  const tones = [...upper].map((l) => TONE_LETTERS[l]);
  if (!tones.length || tones.some((t) => t === undefined)) return null;
  const [first, second] = tones as ToneId[];
  if (upper.length >= 2 && upper[0] === upper[1]) {
    const third = tones[2];
    return third && third !== first ? { primary: first, secondary: third, intense: true } : { primary: first, intense: true };
  }
  return second && second !== first ? { primary: first, secondary: second } : { primary: first };
}

function validSeries(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 12;
}

function fromDigitCode(series: number, digits: string, system: DigitSystem, note?: string): DecodedShade | null {
  if (!validSeries(series)) return null;
  const tones = parseToneDigits(digits, system);
  if (!tones) return null;
  const sep = system === "international" ? "." : system === "wella" ? "/" : "-";
  return makeShade(series, tones, system, digits ? `${series}${sep}${digits}` : `${series}`, note);
}

function decodeSeparated(levelPart: string, sep: string, tonePart: string, preferred?: ToneSystemId): DecodedShade[] {
  const series = Number(levelPart);
  const sepSystem = SEPARATOR_SYSTEM[sep];
  const primary: DigitSystem =
    sepSystem === "international" && preferred && preferred !== "us-letter" ? preferred : sepSystem;
  const out: DecodedShade[] = [];
  const first = fromDigitCode(series, tonePart, primary);
  if (first) out.push(first);
  if (primary !== "international") {
    const alt = fromDigitCode(series, tonePart, "international", "Read with the international (7.1-style) tone digits");
    if (alt) out.push(alt);
  }
  return out;
}

function decodePlainNumber(raw: string): DecodedShade[] {
  const n = raw.length;
  if (n === 1) {
    const s = fromDigitCode(Number(raw), "", "international");
    return s ? [s] : [];
  }
  if (n === 2) {
    if (raw === "10") {
      return [
        makeShade(10, { primary: "natural" }, "international", "10", "Read as level 10 (lightest natural blonde)"),
        makeShade(1, { primary: "natural" }, "international", "1.0", "Some brands write 1.0 (black) as 10"),
      ].filter(Boolean);
    }
    if (raw === "11" || raw === "12") {
      const series = Number(raw);
      return [
        makeShade(series, { primary: "natural" }, "international", raw, "Read as a high-lift blonde series"),
        ...[fromDigitCode(1, raw[1], "international", `Some brands write 1.${raw[1]} as ${raw}`)].filter(
          (s): s is DecodedShade => s !== null,
        ),
      ];
    }
    const s = fromDigitCode(Number(raw[0]), raw[1], "international", `Read ${raw} as ${raw[0]}.${raw[1]}`);
    return s ? [s] : [];
  }
  if (n === 3) {
    if (/^1[012]/.test(raw)) {
      const s = fromDigitCode(Number(raw.slice(0, 2)), raw[2], "international", `Read ${raw} as ${raw.slice(0, 2)}.${raw[2]}`);
      return s ? [s] : [];
    }
    const s = fromDigitCode(Number(raw[0]), raw.slice(1), "international", `Read ${raw} as ${raw[0]}.${raw.slice(1)}`);
    return s ? [s] : [];
  }
  return [];
}

const TONE_WORDS: Array<[RegExp, ToneId]> = [
  [/\bash(y|en)?\b|\bcool\b|\bsmoky\b|\bicy\b|\bice\b/, "ash"],
  [/\biridescent\b|\bviolet\b|\bpurple\b|\blilac\b|\blavender\b/, "violet"],
  [/\bpearl\b|\bsilver\b|\bplatinum\b/, "pearl"],
  [/\bgold(en)?\b|\bhoney\b|\bwarm\b|\bsunny\b|\bbutter\b/, "gold"],
  [/\bcopper\b|\bginger\b|\bauburn\b|\bcaramel\b|\bstrawberry\b/, "copper"],
  [/\bmahogany\b|\bplum\b|\bburgundy\b|\bcherry\b|\bwine\b/, "mahogany"],
  [/\bred\b|\bruby\b|\bcrimson\b/, "red"],
  [/\bmatte?\b|\bkhaki\b|\bolive\b/, "matte"],
  [/\bbeige\b|\bchampagne\b|\bsand\b|\bnude\b/, "beige"],
  [/\bmocha\b|\bchocolate\b|\bespresso\b|\bcocoa\b|\bcoffee\b/, "mocha"],
  [/\bnatural\b|\bneutral\b/, "natural"],
];

const MODIFIERS: Array<[RegExp, string]> = [
  [/\b(extra|ultra) light\b|\blightest\b|\bplatinum\b/, "extra"],
  [/\bvery light\b/, "very-light"],
  [/\blight\b/, "light"],
  [/\bmedium\b|\bmid\b/, "medium"],
  [/\bdarkest\b/, "darkest"],
  [/\bdark\b|\bdeep\b/, "dark"],
];

const LEVEL_BY_BASE: Record<string, Record<string, number>> = {
  black: { default: 1 },
  brown: { darkest: 2, dark: 3, medium: 4, default: 4, light: 5, "very-light": 5, extra: 5 },
  blonde: { darkest: 6, dark: 6, medium: 7, default: 7, light: 8, "very-light": 9, extra: 10 },
};

/** Parses shade names such as "light ash brown", "medium golden blonde" or "platinum". */
export function parseShadeName(text: string): { level: number; tones: ShadeTones } | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\bblond\b/g, "blonde").replace(/\s+/g, " ")} `;
  const found: Array<[number, ToneId]> = [];
  for (const [re, tone] of TONE_WORDS) {
    const m = re.exec(t);
    if (m && !found.some(([, f]) => f === tone)) found.push([m.index, tone]);
  }
  found.sort((x, y) => x[0] - y[0]);
  const intense = /\bintense\b|\bvivid\b|\bdouble\b/.test(t);
  const toneOf = (fallback: ToneId): ShadeTones => {
    const [first, second] = found.map(([, tone]) => tone).filter((tone) => tone !== "natural" || found.length === 1);
    return { primary: first ?? fallback, secondary: second, intense: intense || undefined };
  };

  const baseMatch = [...t.matchAll(/\b(blonde|brown|black)\b/g)].pop();
  if (baseMatch) {
    const base = baseMatch[1];
    const before = t.slice(0, baseMatch.index);
    const modifier = MODIFIERS.find(([re]) => re.test(before))?.[1] ?? "default";
    const level = LEVEL_BY_BASE[base][modifier] ?? LEVEL_BY_BASE[base].default;
    return { level, tones: toneOf("natural") };
  }
  if (/\bplatinum\b|\bsilver\b/.test(t)) return { level: 10, tones: toneOf("pearl") };
  if (/\bauburn\b/.test(t)) return { level: 5, tones: toneOf("copper") };
  if (/\bburgundy\b|\bplum\b/.test(t)) return { level: 4, tones: toneOf("mahogany") };
  if (/\bred\b|\bcopper\b|\bginger\b/.test(t)) return { level: 6, tones: toneOf("red") };
  return null;
}

/**
 * Decodes what a user typed or pasted ("7.1", "Garnier 100", "6G", "9-1 toner", "light ash brown")
 * into one or more interpretations, most likely first.
 */
export function decodeShade(input: string, preferred?: ToneSystemId): DecodeResult {
  const text = input.trim();
  if (!text) return { ok: false, interpretations: [], error: "Type a shade code such as 7.1, 6G or 9-1." };

  const productHint = PRODUCT_HINTS.find(([re]) => re.test(text))?.[1];
  let interpretations: DecodedShade[] = [];

  const separated = /(?<![\d.])(\d{1,2})\s*([.,/-])\s*(\d{1,3})(?![\d.])/.exec(text);
  if (separated) interpretations = decodeSeparated(separated[1], separated[2], separated[3], preferred);

  if (!interpretations.length) {
    const lettered = /(?<![\d.])(\d{1,2})([A-Za-z]{1,3})\b/.exec(text);
    if (lettered && validSeries(Number(lettered[1]))) {
      const tones = parseToneLetters(lettered[2]);
      if (tones) {
        const series = Number(lettered[1]);
        interpretations = [makeShade(series, tones, "us-letter", `${series}${lettered[2].toUpperCase()}`)];
      }
    }
  }

  if (!interpretations.length) {
    const plain = /(?<![\d.])(\d{1,3})(?![\d.])/.exec(text);
    if (plain) interpretations = decodePlainNumber(plain[1]);
  }

  const named = parseShadeName(text);
  if (!interpretations.length && named) {
    interpretations = [
      makeShade(named.level, named.tones, "international", formatCode(named.level, named.tones), "Read from the shade name"),
    ];
  } else if (interpretations.length && named && Math.abs(named.level - interpretations[0].level) >= 2) {
    interpretations[0] = {
      ...interpretations[0],
      note: `The name suggests about level ${named.level}; we used the number. Box names vary by brand.`,
    };
  }

  if (!interpretations.length) {
    return { ok: false, interpretations: [], productHint, error: "We couldn't read that shade. Try the number on the box, e.g. 7.1 or 6G." };
  }
  return { ok: true, interpretations, productHint };
}

export interface ShadeCandidate {
  shade: DecodedShade;
  /** Exact text the code was read from. */
  token: string;
  score: number;
}

// Units after a number, including common OCR misreads ("floz", "fI oz", "f1.oz", "0z", "m1").
const UNIT_AFTER = /^\s*(m[l1i|]\b|millilit|l\b|cl\b|[o0]z|f[l1i|]\b|f[l1i|]\.?\s*[o0]z|g\b|gr\b|gram|kg|lb|%|cm|mm|in\b|pcs|pack|ct\b|count|x\b|min|hour|day|week|year|month|\$|€|£|usd|eur)/i;
const UNIT_BEFORE = /(\$|€|£|usd|eur|no\.? ?of|size|pack of|qty|\bx)\s*$/i;
const SHADE_CONTEXT = /\b(shade|colou?r|blonde?|brown|black|brunette|red|copper|auburn|ash|gold(en)?|mahogany|n[º°o]\.?|#)\b/i;

/**
 * Finds every plausible shade code in free text (OCR output of a box photo, a product page title, a URL slug)
 * and ranks them. Quantities such as "1.7 fl oz" or "100 ml" are ignored.
 */
export function findShadeCandidates(text: string, preferred?: ToneSystemId, limit = 5): ShadeCandidate[] {
  const found = new Map<string, ShadeCandidate>();
  const consider = (match: RegExpExecArray, shades: DecodedShade[], base: number) => {
    const end = match.index + match[0].length;
    const after = text.slice(end, end + 10);
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    if (UNIT_AFTER.test(after) || UNIT_BEFORE.test(before)) return;
    const nearby = text.slice(Math.max(0, match.index - 40), end + 40);
    const score = base + (SHADE_CONTEXT.test(nearby) ? 1.5 : 0);
    for (const [i, shade] of shades.entries()) {
      const s = score - i * 0.5;
      const existing = found.get(shade.code);
      if (!existing || existing.score < s) found.set(shade.code, { shade, token: match[0].trim(), score: s });
    }
  };

  const separated = /(?<![\d.,])(\d{1,2})\s?([.,/-])\s?(\d{1,3})(?![\d.,])/g;
  for (let m; (m = separated.exec(text)); ) consider(m, decodeSeparated(m[1], m[2], m[3], preferred), 3);

  const lettered = /(?<![\d.])\b(\d{1,2})([A-Za-z]{1,3})\b/g;
  for (let m; (m = lettered.exec(text)); ) {
    if (!validSeries(Number(m[1]))) continue;
    // Lowercase unit suffixes ("3g", "50ml") are quantities, not tone letters.
    if (/^(g|ml|oz|fl|l|cl|kg|lb|ct|x|cm|mm|in|pc|pcs)$/.test(m[2])) continue;
    const tones = parseToneLetters(m[2]);
    if (!tones) continue;
    const series = Number(m[1]);
    consider(m, [makeShade(series, tones, "us-letter", `${series}${m[2].toUpperCase()}`)], 2.5);
  }

  // Standalone numbers only: digits glued to letters ("m1", "x2") are units or noise; "6G" is handled above.
  const plain = /(?<![\d.,/A-Za-z-])(\d{1,3})(?![\d.,/A-Za-z-])/g;
  for (let m; (m = plain.exec(text)); ) consider(m, decodePlainNumber(m[1]), 1);

  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
