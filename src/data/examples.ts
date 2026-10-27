import { boxesNeeded } from "@/lib/engine/boxes";
import { predict } from "@/lib/engine/predict";
import { decodeShade } from "@/lib/engine/shade-code";
import { todaySwatch, type SwatchColors } from "@/lib/engine/swatch";
import type { HairProfileInput, Prediction, ProductType } from "@/lib/engine/types";

export interface Example {
  id: string;
  title: string;
  who: string;
  hair: HairProfileInput;
  shadeCode: string;
  product: ProductType;
  lesson: string;
  /** The hair before coloring, including natural roots, highlights or gray. */
  today: SwatchColors;
  prediction: Prediction;
  boxes: number;
}

interface ExampleSpec {
  id: string;
  title: string;
  who: string;
  hair: Omit<HairProfileInput, "levelConfirmed">;
  shadeCode: string;
  product: ProductType;
  lesson: string;
}

const SPECS: ExampleSpec[] = [
  {
    id: "brunette-to-ash-blonde",
    title: "Dark brown to ash blonde, from one box",
    who: "Natural level 4, never colored, long hair",
    hair: { lengthsLevel: 4, naturalLevel: 4, currentTone: "neutral", history: "virgin", gray: "none", ends: "healthy", texture: "straight", thickness: "medium" },
    shadeCode: "9.1",
    product: "permanent",
    lesson: "Box dye lifts only about 2–3 levels. The hair stops around level 6–7, where lightened hair shows orange-gold — far warmer than the cool blonde on the box.",
  },
  {
    id: "box-over-box",
    title: "Lighter box over old box dye",
    who: "Dyed level 4 lengths, natural level 6 roots",
    hair: { lengthsLevel: 4, naturalLevel: 6, currentTone: "warm", naturalTone: "neutral", history: "dyed", gray: "none", ends: "dry", texture: "wavy", thickness: "medium" },
    shadeCode: "7.0",
    product: "permanent",
    lesson: "Color can't lift color: the old dye in the lengths stays dark while the natural roots lighten — classic hot roots.",
  },
  {
    id: "gray-light-shade",
    title: "Covering lots of gray with a light shade",
    who: "Level 6, more than half gray, coarse hair",
    hair: { lengthsLevel: 6, naturalLevel: 6, currentTone: "neutral", history: "virgin", gray: "most", ends: "healthy", texture: "straight", thickness: "coarse" },
    shadeCode: "9.0",
    product: "permanent",
    lesson: "Light shades blend gray instead of covering it. Overall it can look close to the box, but the grays stay brighter, like soft highlights — great for blending. For full coverage, a level 7 or darker natural shade works far better.",
  },
  {
    id: "bleached-to-brown",
    title: "Bleached blonde back to brown",
    who: "Bleached to level 9, natural level 6",
    hair: { lengthsLevel: 9, naturalLevel: 6, currentTone: "warm", naturalTone: "neutral", history: "bleached", gray: "none", ends: "dry", texture: "straight", thickness: "fine" },
    shadeCode: "5.1",
    product: "permanent",
    lesson: "Lightened hair has lost its warm pigments. A cool brown straight on top can turn murky or greenish — colorists add a warm filler first.",
  },
  {
    id: "same-level-gloss",
    title: "A warm refresh at the same level",
    who: "Natural level 6, never colored",
    hair: { lengthsLevel: 6, naturalLevel: 6, currentTone: "neutral", history: "virgin", gray: "none", ends: "healthy", texture: "curly", thickness: "medium" },
    shadeCode: "6.3",
    product: "demi",
    lesson: "Staying at your level and adding tone is where box color shines: the result lands close to the box.",
  },
  {
    id: "highlights-all-over",
    title: "All-over blonde on top of highlights",
    who: "Natural level 4 with level 8 highlights",
    hair: { lengthsLevel: 6.5, naturalLevel: 4, currentTone: "warm", naturalTone: "neutral", history: "highlighted", gray: "none", ends: "dry", texture: "straight", thickness: "medium" },
    shadeCode: "8.0",
    product: "permanent",
    lesson: "Highlighted and natural strands take dye differently, so one box usually gives stripes instead of an even blonde.",
  },
];

function build(spec: ExampleSpec): Example {
  const hair: HairProfileInput = { ...spec.hair, levelConfirmed: true };
  const shade = decodeShade(spec.shadeCode).interpretations[0];
  const prediction = predict(hair, shade, spec.product);
  return {
    id: spec.id,
    title: spec.title,
    who: spec.who,
    hair,
    shadeCode: spec.shadeCode,
    product: spec.product,
    lesson: spec.lesson,
    today: todaySwatch(hair),
    prediction,
    boxes: boxesNeeded("long", "medium").boxes,
  };
}

export const EXAMPLES: Example[] = SPECS.map(build);
