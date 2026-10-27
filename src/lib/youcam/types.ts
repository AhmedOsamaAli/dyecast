export type YouCamFeature =
  | "skin-tone-analysis"
  | "hair-length-detection"
  | "hair-density-detection"
  | "hair-color";

export const YOUCAM_FEATURES: readonly YouCamFeature[] = [
  "skin-tone-analysis",
  "hair-length-detection",
  "hair-density-detection",
  "hair-color",
];

/** Units charged per successful task (YouCam pricing page / API reference, Oct 2026). */
export const FEATURE_UNITS: Record<YouCamFeature, number> = {
  "skin-tone-analysis": 20,
  "hair-length-detection": 2,
  "hair-density-detection": 1,
  "hair-color": 1,
};

export type TaskStatus = "running" | "success" | "error";

export interface TaskResult<T = unknown> {
  status: TaskStatus;
  results?: T;
  error?: string;
  errorMessage?: string;
  mock?: boolean;
}

export interface SkinToneResults {
  face_quality?: { has_face?: boolean; area?: string; frontal?: string; lighting?: string; faceangle?: string };
  color: {
    skin_color?: string;
    hair_color?: string;
    hair_color_name?: string;
    eye_color?: string;
    eye_color_name?: string;
    lip_color?: string;
    eyebrow_color?: string;
  };
}

export interface HairLengthResults {
  hair_length: { term: string };
}

export interface HairDensityResults {
  hair_density: { term: string; mapping?: string };
}

export interface HairColorResults {
  /** Result image URL (valid ~2 hours). Empty in mock mode: the client renders a local preview. */
  url: string;
}
