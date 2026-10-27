import { z } from "zod";
import { rateLimit } from "@/lib/auth/rate-limit";
import { apiError, apiUser, errorResponse, json } from "@/lib/http";
import { startTask, userOwnsFile } from "@/lib/youcam/service";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const intensity = z.number().int().min(0).max(100);

const renderSchema = z.discriminatedUnion("mode", [
  z.object({
    fileId: z.string().min(8).max(300),
    mode: z.literal("full"),
    color: hex,
    intensity,
    shine: intensity,
  }),
  z.object({
    fileId: z.string().min(8).max(300),
    mode: z.literal("ombre"),
    /** Top (roots) and bottom (lengths) colors. */
    top: hex,
    bottom: hex,
    intensity,
    shine: intensity,
    blend: intensity,
    offset: z.number().min(-0.99).max(0.99),
  }),
]);

/** Starts a YouCam Hair Color try-on with the predicted color (one zone) or roots + lengths (ombre). */
export async function POST(request: Request): Promise<Response> {
  const auth = await apiUser(request, { mutation: true });
  if (auth.response) return auth.response;
  const parsed = renderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("Invalid preview request.", 400, "bad_request");
  const input = parsed.data;

  const limit = await rateLimit(`render:${auth.user.id}`, 40, 60 * 60 * 1000);
  if (!limit.ok) return apiError("Too many previews. Please wait a few minutes.", 429, "rate_limited");
  if (!(await userOwnsFile(auth.user.id, input.fileId))) return apiError("Upload your photo again.", 403, "file_owner");

  const body =
    input.mode === "full"
      ? {
          src_file_id: input.fileId,
          pattern: { name: "full" },
          palettes: [{ color: input.color, color_intensity: input.intensity, shine_intensity: input.shine }],
        }
      : {
          src_file_id: input.fileId,
          pattern: { name: "ombre", blend_strength: input.blend, line_offset: input.offset, coloring_section: "top" },
          palettes: [
            { color: input.top, color_intensity: input.intensity, shine_intensity: input.shine },
            { color: input.bottom, color_intensity: input.intensity, shine_intensity: input.shine },
          ],
        };
  try {
    return json(await startTask(auth.user.id, "hair-color", body));
  } catch (error) {
    return errorResponse(error);
  }
}
