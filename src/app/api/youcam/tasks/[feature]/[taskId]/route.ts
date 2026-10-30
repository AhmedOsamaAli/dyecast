import { after } from "next/server";
import { apiError, apiUser, errorResponse, json } from "@/lib/http";
import { taskErrorMessage } from "@/lib/youcam/errors";
import { forgetRemoteTask, pollTask } from "@/lib/youcam/service";
import {
  YOUCAM_FEATURES,
  type HairDensityResults,
  type HairLengthResults,
  type SkinToneResults,
  type YouCamFeature,
} from "@/lib/youcam/types";

/** Only the fields the app needs leave the server. */
function publicResults(feature: YouCamFeature, results: unknown) {
  if (!results) return undefined;
  switch (feature) {
    case "skin-tone-analysis": {
      const r = results as SkinToneResults;
      return {
        hairColor: r.color?.hair_color,
        hairColorName: r.color?.hair_color_name,
        skinColor: r.color?.skin_color,
        lighting: r.face_quality?.lighting,
        frontal: r.face_quality?.frontal,
      };
    }
    case "hair-length-detection":
      return { term: (results as HairLengthResults).hair_length?.term };
    case "hair-density-detection":
      return { term: (results as HairDensityResults).hair_density?.term };
    default:
      return undefined;
  }
}

export async function GET(request: Request, ctx: RouteContext<"/api/youcam/tasks/[feature]/[taskId]">): Promise<Response> {
  const auth = await apiUser(request);
  if (auth.response) return auth.response;
  const { feature, taskId } = await ctx.params;
  if (!(YOUCAM_FEATURES as readonly string[]).includes(feature) || taskId.length > 200) {
    return apiError("Unknown task.", 404, "not_found");
  }
  try {
    const result = await pollTask(auth.user.id, feature as YouCamFeature, taskId);
    // Analysis results are delivered in this response, and a failed task has nothing to deliver: delete them from
    // YouCam right away. Finished renders are deleted once downloaded (see renders/[taskId]).
    if (result.status === "error" || (result.status === "success" && feature !== "hair-color")) after(() => forgetRemoteTask(taskId));
    return json({
      status: result.status,
      mock: Boolean(result.mock),
      results: publicResults(feature as YouCamFeature, result.results),
      error: result.status === "error" ? taskErrorMessage(result.error ?? result.errorMessage) : undefined,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
