import { eq } from "drizzle-orm";
import { rateLimit } from "@/lib/auth/rate-limit";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { apiError, apiUser, errorResponse, json } from "@/lib/http";
import { photoStorageAvailable, saveSelfie } from "@/lib/photos/store";
import { validateImage } from "@/lib/photos/validate";
import { startTask, uploadForUser } from "@/lib/youcam/service";

export const maxDuration = 30;

async function readImage(form: FormData, field: string) {
  const file = form.get(field);
  if (!(file instanceof File)) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateImage(bytes);
  return { bytes, check };
}

/**
 * Analyzes a selfie with YouCam: Facial Color Tones (hair + skin color) and Hair Length Detection,
 * plus Hair Density Detection when a second, head-tilted photo is provided.
 * The photo is processed in memory; it is only stored (encrypted) if the user opted in.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await apiUser(request, { mutation: true });
  if (auth.response) return auth.response;
  const { user } = auth;

  const limit = await rateLimit(`analyze:${user.id}`, 12, 60 * 60 * 1000);
  if (!limit.ok) return apiError(`Too many photos. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`, 429, "rate_limited");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("Send the photo as a form upload.", 400, "bad_form");
  }
  if (form.get("consent") !== "yes") return apiError("Please agree to photo processing first.", 400, "consent");

  const selfie = await readImage(form, "photo");
  if (!selfie) return apiError("Choose a photo first.", 400, "no_photo");
  if (!selfie.check.ok) return apiError(selfie.check.error, 400, "bad_photo");
  const density = await readImage(form, "densityPhoto");
  if (density && !density.check.ok) return apiError(`Hair density photo: ${density.check.error}`, 400, "bad_photo");

  try {
    // One upload per task: YouCam deletes a task's input file when we delete the finished task.
    const mime = selfie.check.image.mime;
    const [toneUpload, lengthUpload] = await Promise.all([
      uploadForUser(user.id, selfie.bytes.buffer as ArrayBuffer, mime),
      uploadForUser(user.id, selfie.bytes.buffer as ArrayBuffer, mime),
    ]);
    const [tone, length] = await Promise.all([
      startTask(user.id, "skin-tone-analysis", { src_file_id: toneUpload.fileId, face_angle_strictness_level: "medium" }),
      startTask(user.id, "hair-length-detection", { src_file_id: lengthUpload.fileId }),
    ]);
    let densityTask: string | undefined;
    if (density?.check.ok) {
      const densityUpload = await uploadForUser(user.id, density.bytes.buffer as ArrayBuffer, density.check.image.mime);
      densityTask = (await startTask(user.id, "hair-density-detection", { src_file_id: densityUpload.fileId })).taskId;
    }

    const [settings] = await db.select({ storePhotos: users.storePhotos }).from(users).where(eq(users.id, user.id)).limit(1);
    let storedUntil: string | undefined;
    if (settings?.storePhotos && photoStorageAvailable()) {
      const bytes = Buffer.from(selfie.bytes);
      storedUntil = (await saveSelfie(user.id, bytes, mime)).expiresAt.toISOString();
    }

    return json({
      mock: toneUpload.mock,
      tasks: { tone: tone.taskId, length: length.taskId, density: densityTask },
      storedUntil,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
