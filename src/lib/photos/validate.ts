export type ImageMime = "image/jpeg" | "image/png";

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MIN_IMAGE_SIDE = 320;
export const MAX_IMAGE_SIDE = 2048;

export interface SniffedImage {
  mime: ImageMime;
  width: number;
  height: number;
}

function pngInfo(b: Uint8Array): SniffedImage | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !sig.every((v, i) => b[i] === v)) return null;
  // IHDR must be the first chunk.
  if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== "IHDR") return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { mime: "image/png", width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegInfo(b: Uint8Array): SniffedImage | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = (b[i + 2] << 8) | b[i + 3];
    if (length < 2) return null;
    // Start-of-frame markers carry the dimensions (excluding DHT C4, JPG C8 and DAC CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { mime: "image/jpeg", height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    if (marker === 0xda || marker === 0xd9) return null;
    i += 2 + length;
  }
  return null;
}

/** Identifies a JPEG or PNG by its bytes (never trusts the declared type) and reads its dimensions. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  return jpegInfo(bytes) ?? pngInfo(bytes);
}

export type ImageCheck = { ok: true; image: SniffedImage } | { ok: false; error: string };

export function validateImage(bytes: Uint8Array): ImageCheck {
  if (bytes.byteLength === 0) return { ok: false, error: "The photo is empty." };
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: "The photo is too large (max 4 MB)." };
  const image = sniffImage(bytes);
  if (!image) return { ok: false, error: "Use a JPEG or PNG photo." };
  const short = Math.min(image.width, image.height);
  const long = Math.max(image.width, image.height);
  if (short < MIN_IMAGE_SIDE) return { ok: false, error: "The photo is too small. Use at least 320 pixels on each side." };
  if (long > MAX_IMAGE_SIDE) return { ok: false, error: "The photo is too large. Use at most 2048 pixels on the long side." };
  return { ok: true, image };
}
