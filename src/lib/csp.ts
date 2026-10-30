/**
 * Content-Security-Policy for pages. Scripts run only from our origin, with this request's nonce (Next.js adds it to
 * its own inline scripts). MediaPipe and Tesseract executable assets are served from this site, not a third-party
 * script CDN. Only model data is downloaded remotely.
 */
export const AI_ASSETS = {
  mediapipe: "/vendor/mediapipe-1.1.1/",
  mediapipeModels: "https://storage.googleapis.com/mediapipe-models/",
  tesseract: "/vendor/tesseract.js-7.0.0/",
  tesseractCore: "/vendor/tesseract.js-core-7.0.0/",
  tesseractData: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/",
} as const;

export function contentSecurityPolicy(nonce: string, dev = process.env.NODE_ENV !== "production"): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${AI_ASSETS.mediapipeModels} ${AI_ASSETS.tesseractData}${dev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
