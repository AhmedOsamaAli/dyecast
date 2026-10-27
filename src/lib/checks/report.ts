import { hexToLab } from "@/lib/color";
import { boxesNeeded } from "@/lib/engine/boxes";
import { findPaths } from "@/lib/engine/get-there";
import { buildPlan } from "@/lib/engine/plan";
import { predict } from "@/lib/engine/predict";
import { safetyChecklist } from "@/lib/engine/safety";
import { decodeShade } from "@/lib/engine/shade-code";
import type { HairProfileInput } from "@/lib/engine/types";
import type { StudioInput } from "./validation";

export function toEngineProfile(input: StudioInput): HairProfileInput {
  return { ...input, levelConfirmed: true };
}

export function decodeToner(code: string | undefined) {
  if (!code) return undefined;
  const decoded = decodeShade(code, "international");
  return decoded.ok && decoded.interpretations.length === 1 ? decoded.interpretations[0] : undefined;
}

export function buildReport(input: StudioInput) {
  const decoded = decodeShade(input.shadeCode, input.system);
  if (!decoded.ok || !decoded.interpretations.length) {
    return { ok: false as const, error: decoded.error ?? "This shade code could not be decoded." };
  }
  if (decoded.interpretations.length > 1) {
    return { ok: false as const, error: "This code is ambiguous. Use a separated code such as 7.1, 7/1 or 7-1." };
  }
  const shade = decoded.interpretations[0];
  if (shade.suggestedProduct === "high-lift" && input.product !== "high-lift") {
    return { ok: false as const, error: "An 11/12-series shade needs the high-lift product setting. Check your box instructions." };
  }
  const profile = toEngineProfile(input);
  const prediction = predict(profile, shade, input.product);
  const needsConsultation = input.history === "henna" || input.ends === "damaged";
  const goal = input.goalHex ? hexToLab(input.goalHex) : prediction.promise.lab;
  return {
    ok: true as const,
    report: {
      version: 2 as const,
      prediction,
      boxes: boxesNeeded(input.length, input.density),
      safety: safetyChecklist(profile, prediction),
      paths: needsConsultation ? null : findPaths(profile, goal),
      needsConsultation,
    },
  };
}

export type CheckReport = Extract<ReturnType<typeof buildReport>, { ok: true }>["report"];

/** The personalized step-by-step plan (derived on demand so older saved checks get it too). */
export function planFor(input: StudioInput, report: CheckReport) {
  return buildPlan(toEngineProfile(input), report.prediction, {
    boxes: report.boxes.boxes,
    toner: decodeToner(input.tonerCode),
  });
}
