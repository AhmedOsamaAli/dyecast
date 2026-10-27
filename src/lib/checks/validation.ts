import { z } from "zod";
import { DENSITY_CLASSES, LENGTH_CLASSES } from "@/lib/engine/boxes";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** What a photo suggested. Suggestions only — the user's confirmed choices drive every prediction. */
export const measurementSchema = z.object({
  measuredHex: hex.optional(),
  youcamHairHex: hex.optional(),
  youcamHairClass: z.string().max(20).optional(),
  skinHex: hex.optional(),
  lengthTerm: z.string().max(40).optional(),
  densityTerm: z.string().max(40).optional(),
  suggestedLevel: z.number().min(1).max(10).optional(),
  mock: z.boolean(),
  analyzedAt: z.string().max(40),
});

export type Measurement = z.infer<typeof measurementSchema>;

const measurementField = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) return undefined;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return "invalid";
  }
}, measurementSchema.optional());

export const hairProfileSchema = z.object({
  lengthsLevel: z.coerce.number().min(1).max(10).multipleOf(0.5),
  naturalLevel: z.coerce.number().min(1).max(10).multipleOf(0.5),
  currentTone: z.enum(["neutral", "warm", "cool", "red"]),
  naturalTone: z.enum(["neutral", "warm", "cool", "red"]),
  history: z.enum(["virgin", "dyed", "highlighted", "bleached", "henna"]),
  gray: z.enum(["none", "some", "half", "most"]),
  ends: z.enum(["healthy", "dry", "damaged"]),
  texture: z.enum(["straight", "wavy", "curly", "coily"]),
  thickness: z.enum(["fine", "medium", "coarse"]),
  length: z.enum(LENGTH_CLASSES),
  density: z.enum(DENSITY_CLASSES),
  measurement: measurementField,
}).superRefine((profile, ctx) => {
  if (profile.history === "virgin" &&
      (profile.lengthsLevel !== profile.naturalLevel || profile.currentTone !== profile.naturalTone)) {
    ctx.addIssue({
      code: "custom",
      path: ["naturalLevel"],
      message: "For never-colored hair, use the same level and tone for roots and lengths.",
    });
  }
});

export const CHECK_SOURCES = ["code", "link", "box-photo", "goal"] as const;
export type CheckSource = (typeof CHECK_SOURCES)[number];

const optionalText = (max: number) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().max(max).optional());

/** The box (or goal) being checked. Combined with the saved hair profile on the server. */
export const checkTargetSchema = z.object({
  shadeCode: z.string().trim().min(1, "Enter the shade code on your box.").max(60),
  system: z.enum(["international", "wella", "schwarzkopf", "us-letter"]),
  product: z.enum(["semi", "demi", "permanent", "high-lift"]),
  source: z.enum(CHECK_SOURCES).default("code"),
  goalHex: z.preprocess((v) => (v === "" || v === null ? undefined : v), hex.optional()),
  goalName: optionalText(60),
  tonerCode: optionalText(12),
  productUrl: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.url({ protocol: /^https?$/ }).max(500).optional(),
  ),
  productTitle: optionalText(200),
});

/** A full profile plus a target in one object (stored with each check as an immutable snapshot). */
export const studioSchema = hairProfileSchema.safeExtend(checkTargetSchema.shape);

export type HairProfileData = z.infer<typeof hairProfileSchema>;
export type CheckTarget = z.infer<typeof checkTargetSchema>;
export type StudioInput = z.infer<typeof studioSchema>;

export const DEFAULT_PROFILE: HairProfileData = {
  lengthsLevel: 4,
  naturalLevel: 4,
  currentTone: "neutral",
  naturalTone: "neutral",
  history: "virgin",
  gray: "none",
  ends: "healthy",
  texture: "straight",
  thickness: "medium",
  length: "medium",
  density: "medium",
};
