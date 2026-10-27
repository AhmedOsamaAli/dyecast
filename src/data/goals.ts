import { labToHex } from "@/lib/color";
import { shadeIdealLab } from "@/lib/engine/predict";
import { formatCode } from "@/lib/engine/shade-code";
import type { ShadeTones } from "@/lib/engine/types";

export interface GoalColor {
  id: string;
  name: string;
  family: "blonde" | "brown" | "red" | "dark";
  level: number;
  tones: ShadeTones;
  code: string;
  hex: string;
}

function goal(id: string, name: string, family: GoalColor["family"], level: number, tones: ShadeTones): GoalColor {
  return { id, name, family, level, tones, code: formatCode(level, tones), hex: labToHex(shadeIdealLab(level, tones)) };
}

/** Goal colors people actually ask for, expressed in the same color model the engine predicts with. */
export const GOAL_COLORS: GoalColor[] = [
  goal("platinum", "Platinum blonde", "blonde", 10, { primary: "pearl" }),
  goal("icy-ash", "Icy ash blonde", "blonde", 9, { primary: "ash" }),
  goal("pearl", "Pearl blonde", "blonde", 9, { primary: "pearl" }),
  goal("beige", "Beige blonde", "blonde", 8, { primary: "beige" }),
  goal("golden", "Golden blonde", "blonde", 8, { primary: "gold" }),
  goal("honey", "Honey blonde", "blonde", 7, { primary: "gold", secondary: "copper" }),
  goal("dark-ash-blonde", "Dark ash blonde", "blonde", 6, { primary: "ash" }),
  goal("strawberry", "Strawberry blonde", "red", 8, { primary: "copper", secondary: "gold" }),
  goal("copper", "Copper red", "red", 7, { primary: "copper", intense: true }),
  goal("auburn", "Auburn", "red", 5, { primary: "copper", secondary: "red" }),
  goal("mahogany", "Mahogany", "red", 4, { primary: "mahogany" }),
  goal("caramel", "Caramel brown", "brown", 6, { primary: "gold", secondary: "copper" }),
  goal("light-ash-brown", "Light ash brown", "brown", 5, { primary: "ash" }),
  goal("chocolate", "Chocolate brown", "brown", 4, { primary: "mocha" }),
  goal("espresso", "Espresso", "dark", 3, { primary: "natural" }),
  goal("soft-black", "Soft black", "dark", 1, { primary: "natural" }),
];
