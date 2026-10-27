"use client";

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  /** Object URL for previews. Revoke when done. */
  url: string;
}

/** Long side used for YouCam uploads (their hair APIs accept up to 1920×1080; we stay well inside). */
export const UPLOAD_MAX_SIDE = 1024;
const MIN_SIDE = 320;

/**
 * Decodes, orients, downsizes and re-encodes a photo as JPEG in the browser.
 * Re-encoding drops every metadata block (EXIF, GPS location, device info) before upload.
 */
export async function prepareImage(file: Blob, maxSide = UPLOAD_MAX_SIDE): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("We couldn't open that image. Try a JPEG or PNG photo.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  if (Math.min(width, height) < MIN_SIDE) {
    bitmap.close();
    throw new Error("That photo is too small. Use one at least 320 pixels wide.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process images.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode the photo."))), "image/jpeg", 0.9),
  );
  return { blob, width, height, url: URL.createObjectURL(blob) };
}

export async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}
