import { rateLimit } from "@/lib/auth/rate-limit";
import { apiError, apiUser, errorResponse, json } from "@/lib/http";
import { validateImage } from "@/lib/photos/validate";
import { checkBudget, uploadForUser } from "@/lib/youcam/service";

/**
 * Uploads a photo to YouCam's File API for try-on renders (no analysis units are spent). Refused up front when no
 * render could start today, so the photo isn't sent anywhere for nothing.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await apiUser(request, { mutation: true });
  if (auth.response) return auth.response;
  const limit = await rateLimit(`upload:${auth.user.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return apiError("Too many uploads. Please wait a few minutes.", 429, "rate_limited");

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (form?.get("consent") !== "yes") return apiError("Please agree to photo processing first.", 400, "consent");
  if (!(file instanceof File)) return apiError("Choose a photo first.", 400, "no_photo");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateImage(bytes);
  if (!check.ok) return apiError(check.error, 400, "bad_photo");
  try {
    await checkBudget(auth.user.id, ["hair-color"]);
    return json(await uploadForUser(auth.user.id, bytes.buffer as ArrayBuffer, check.image.mime));
  } catch (error) {
    return errorResponse(error);
  }
}
