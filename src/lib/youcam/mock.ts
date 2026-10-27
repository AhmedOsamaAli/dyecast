import type {
  HairColorResults,
  HairDensityResults,
  HairLengthResults,
  SkinToneResults,
  TaskResult,
  YouCamFeature,
} from "./types";

/** Canned, realistic responses so the whole product works without spending units. */
const MOCK_RESULTS: Record<YouCamFeature, unknown> = {
  "skin-tone-analysis": {
    face_quality: { has_face: true, area: "good", frontal: "good", lighting: "good", faceangle: "good" },
    color: {
      skin_color: "#c69c7d",
      hair_color: "#42280E",
      hair_color_name: "Brown",
      eye_color: "#5b3a29",
      eye_color_name: "Brown",
      lip_color: "#b5646a",
      eyebrow_color: "#3b2a20",
    },
  } satisfies SkinToneResults,
  "hair-length-detection": { hair_length: { term: "above chest or longer" } } satisfies HairLengthResults,
  "hair-density-detection": { hair_density: { term: "Medium Density", mapping: "2.1" } } satisfies HairDensityResults,
  "hair-color": { url: "" } satisfies HairColorResults,
};

export function mockTaskId(feature: YouCamFeature): string {
  return `mock_${feature}_${crypto.randomUUID()}`;
}

export function isMockTaskId(taskId: string): boolean {
  return taskId.startsWith("mock_");
}

export function mockTaskResult<T>(feature: YouCamFeature): TaskResult<T> {
  return { status: "success", results: MOCK_RESULTS[feature] as T, mock: true };
}
