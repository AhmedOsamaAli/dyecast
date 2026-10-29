import { deltaE2000, hexToLab, labToLch } from "@/lib/color";
import { GOAL_COLORS, type GoalColor } from "@/data/goals";
import { findPaths } from "./get-there";
import { levelFromLightness, UNDERLYING_NAMES } from "./levels";
import { describedHairLab, GAP_CLOSE } from "./predict";
import type { BoxMatch } from "./retail";
import type { HairProfileInput, ProductType, ShadeTones, ToneId } from "./types";

/**
 * "Help me choose": which goal colors fit this person. Each goal is first worked out on their hair (the same route
 * search as the goal mode), then ranked by how much change they want, how much upkeep suits them, and whether the
 * color's temperature suits their skin's undertone. Every pick explains itself with reasons and cautions.
 */

export type Boldness = "subtle" | "noticeable" | "bold";
export type Upkeep = "low" | "medium" | "high";
export type Undertone = "warm" | "neutral" | "cool";

export interface ChoosePrefs {
  boldness: Boldness;
  upkeep: Upkeep;
  undertone: Undertone;
}

export type RouteKind = "one-box" | "box-and-toner" | "colorist";

/** One box in a route, small enough to send to the browser. */
export interface RouteStep {
  code: string;
  name: string;
  role: "color" | "toner";
  level: number;
  tones: ShadeTones;
  product: ProductType;
  /** Real boxes that fit this step (attached on the server, see retail.ts). */
  boxes?: BoxMatch[];
}

/** How a goal color works out on this person's hair, before any preferences. */
export interface GoalReach {
  goal: GoalColor;
  route: RouteKind;
  /** The boxes of the best route (empty when it takes a colorist). */
  steps: RouteStep[];
  /** How far the box route lands from the goal (CIEDE2000); null when it takes a colorist. */
  distance: number | null;
  /** What the person would likely see: the box route's result, or the goal itself when it takes a colorist. */
  likelyHex: string;
  /** How different that is from their hair today (CIEDE2000). */
  change: number;
  /** Levels between that result and their natural roots: how soon regrowth shows. */
  regrowth: number;
  /** Why it takes a colorist, when it does. */
  colorist?: string;
  /** Why a box of another tone lands closest, when lifting never-colored hair brings out its own warmth. */
  ownWarmth?: string;
}

export interface ColorPick extends GoalReach {
  /** Lower is a better fit. */
  score: number;
  reasons: string[];
  cautions: string[];
}

const COOL_TONES = new Set(["ash", "pearl", "violet", "blue", "matte", "mahogany"]);
const WARM_TONES = new Set(["gold", "copper", "red", "warm"]);

/** Whether a shade reads warm, cool or neutral, from its main tone. */
export function goalTemperature(tones: ShadeTones): Undertone {
  if (COOL_TONES.has(tones.primary)) return "cool";
  if (WARM_TONES.has(tones.primary)) return "warm";
  return "neutral";
}

/** Skin undertone from a measured skin color: more yellow reads warm, more pink reads cool (CIELAB hue angle). */
export function undertoneFromSkin(hex: string): Undertone {
  const { h } = labToLch(hexToLab(hex));
  if (h >= 60) return "warm";
  if (h <= 47) return "cool";
  return "neutral";
}

/** Works out every goal color on this hair. One route search per goal, so compute it once per profile (server side). */
export function reachGoals(profile: HairProfileInput, goals: GoalColor[] = GOAL_COLORS): GoalReach[] {
  const today = profile.lengthsLab ?? describedHairLab(profile.lengthsLevel, profile.currentTone ?? "neutral");
  return goals.map((goal) => {
    const result = findPaths(profile, hexToLab(goal.hex), { limit: 1 });
    const option = result.professional ? undefined : result.options[0];
    const likely = option ? option.resultLab : hexToLab(goal.hex);
    return {
      goal,
      route: !option ? "colorist" : option.steps.length > 1 ? "box-and-toner" : "one-box",
      steps: (option?.steps ?? []).map(({ shade, role }) => ({
        code: shade.code,
        name: shade.name,
        role,
        level: shade.level,
        tones: shade.tones,
        product: shade.product,
      })),
      distance: option ? option.distance : null,
      likelyHex: option ? option.resultHex : goal.hex,
      change: deltaE2000(today, likely),
      regrowth: Math.abs(levelFromLightness(likely.L) - profile.naturalLevel),
      colorist: result.professionalReason,
      ownWarmth: ownWarmth(profile, goal, option?.steps.find((s) => s.role === "color")?.shade),
    };
  });
}

const WARM_GOAL_TONES = new Set<ToneId>(["gold", "copper", "red", "mahogany", "warm"]);

/**
 * Lightening never-colored hair exposes its warm underlying pigment, so a natural or ash box can land closest to a warm
 * goal. Says so, so a "Mahogany" pick with a natural brown box doesn't look like a mistake.
 */
function ownWarmth(profile: HairProfileInput, goal: GoalColor, box: { level: number; tones: ShadeTones } | undefined): string | undefined {
  if (!box || profile.history !== "virgin" || box.level < profile.naturalLevel + 1) return undefined;
  if (!WARM_GOAL_TONES.has(goal.tones.primary) || WARM_GOAL_TONES.has(box.tones.primary)) return undefined;
  const pigment = UNDERLYING_NAMES[Math.round(Math.min(10, Math.max(1, box.level)))];
  const tone = box.tones.primary;
  return `Lifting your hair brings out its own ${pigment} warmth, so ${/^[aeiou]/.test(tone) ? "an" : "a"} ${tone} box lands closest`;
}

/** How much visible change each answer asks for (CIEDE2000 from today's hair). */
const CHANGE_BAND: Record<Boldness, [number, number]> = { subtle: [4, 12], noticeable: [10, 24], bold: [22, Infinity] };
const CHANGE_WORDS: Record<Boldness, string> = { subtle: "A subtle refresh", noticeable: "A noticeable change", bold: "A bold change" };
/** Levels of regrowth contrast each upkeep answer accepts before roots become a chore. */
const REGROWTH_OK: Record<Upkeep, number> = { low: 1.5, medium: 3, high: Infinity };

/** Ranks worked-out goals for one set of answers, best fit first. Cheap: run it on every answer. */
export function rankGoals(reach: GoalReach[], profile: Pick<HairProfileInput, "gray">, prefs: ChoosePrefs): ColorPick[] {
  return reach
    .map((r): ColorPick => {
      const reasons: string[] = [];
      const cautions: string[] = [];
      let score = 0;

      // Can a box get there on this hair?
      if (r.route === "colorist" || r.distance === null) {
        score += 8;
        cautions.push(r.colorist ?? "From your hair, this takes a colorist.");
      } else {
        reasons.push(r.route === "one-box" ? "One box gets you there on your hair" : "A box plus a toner gets you there");
        if (r.ownWarmth) reasons.push(r.ownWarmth);
        if (r.route === "box-and-toner") score += 1;
        if (r.distance > GAP_CLOSE) {
          score += (r.distance - GAP_CLOSE) * 0.5;
          cautions.push("On your hair it lands a little off this shade; the swatch shows how");
        }
      }

      // As much change as they asked for.
      const [lo, hi] = CHANGE_BAND[prefs.boldness];
      if (r.change < lo) score += (lo - r.change) * 0.6;
      else if (r.change > hi) {
        score += (r.change - hi) * 0.4;
        if (r.change > hi + 6) cautions.push("A bigger change than you asked for");
      } else reasons.push(CHANGE_WORDS[prefs.boldness]);
      if (r.change < 4) {
        score += 3;
        cautions.push("Close to your color today");
      }

      // Upkeep: how soon roots show, and colors that fade or need toning.
      const allowed = REGROWTH_OK[prefs.upkeep];
      if (r.regrowth > allowed) {
        score += (r.regrowth - allowed) * 2;
        cautions.push(`Roots show within weeks: about ${Math.round(r.regrowth)} levels from your natural color`);
      } else if (r.regrowth <= 1) reasons.push("Grows out softly, close to your natural color");
      if (prefs.upkeep !== "high") {
        const weight = prefs.upkeep === "low" ? 3 : 1.5;
        if (r.goal.family === "red") {
          score += weight;
          cautions.push("Reds fade fast: plan a color gloss every few weeks");
        }
        if (r.goal.level >= 9 && goalTemperature(r.goal.tones) === "cool") {
          score += weight;
          cautions.push("Cool blondes need regular toning to stay cool");
        }
        if ((profile.gray === "half" || profile.gray === "most") && levelFromLightness(hexToLab(r.likelyHex).L) <= 4) {
          score += 2;
          cautions.push("Gray roots show quickly against dark color");
        }
      }

      // Undertone: warm shades tend to flatter warm skin, cool shades cool skin; neutral shades suit everyone.
      const temperature = goalTemperature(r.goal.tones);
      if (prefs.undertone !== "neutral" && temperature !== "neutral") {
        if (temperature === prefs.undertone) {
          score -= 2;
          reasons.push(`Flatters ${prefs.undertone} undertones`);
        } else {
          score += 3;
          cautions.push(`Usually less flattering on ${prefs.undertone} undertones`);
        }
      }

      return { ...r, score, reasons, cautions };
    })
    .sort((a, b) => a.score - b.score);
}
