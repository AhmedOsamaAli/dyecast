/** Shown when the browser can't open a camera inside the page (old browsers, or pages not served over HTTPS). */
export const NO_CAMERA_MESSAGE = "This browser can't open the camera here. Use Upload instead.";

/** True when this browser can show a live camera in the page. */
export function canUseCamera(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

/** Why the camera couldn't start, in plain words, with the way forward (uploading always works). */
export function cameraErrorMessage(error: unknown): string {
  const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access is blocked. Allow the camera for this site (the camera icon in the address bar), or use Upload instead.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device. Use Upload instead.";
    case "NotReadableError":
    case "AbortError":
      return "The camera is busy in another app. Close that app and try again, or use Upload instead.";
    default:
      return "The camera couldn't start. Try again, or use Upload instead.";
  }
}
