/** Plain-language messages for YouCam failures. YouCam's own wording never reaches the browser. */

const TASK_ERRORS: Array<[RegExp, string]> = [
  [/no_face/, "We couldn't find a face. Use a clear photo that shows your whole face."],
  [/face_angle|not_forward_facing|pose/, "Face the camera straight on, with your head level."],
  [/face_position/, "Move a little closer so your face is fully in the photo and fills more of it."],
  [/insufficient_lighting/, "The photo is too dark. Face a window or add light, then try again."],
  [/image_size|max_filesize|decode_image/, "That photo couldn't be read. Try a different JPEG or PNG photo."],
  [/nsfw/, "That photo couldn't be processed. Try a different photo."],
];

const TASK_FALLBACK = "The photo couldn't be analyzed. Try a clear, front-facing photo in daylight.";

/** What to tell the person when a YouCam task fails, from its error code. */
export function taskErrorMessage(code?: string | null): string {
  const value = (code ?? "").toLowerCase();
  return TASK_ERRORS.find(([pattern]) => pattern.test(value))?.[1] ?? TASK_FALLBACK;
}

/** What to tell the person when a YouCam request fails, from its HTTP status. */
export function requestErrorMessage(status: number): string {
  if (status === 429) return "The photo service is busy right now. Try again in a minute.";
  if (status >= 500) return "The photo service is having trouble right now. Try again in a minute.";
  return "The photo service couldn't take that request. Try again, or use another photo.";
}
