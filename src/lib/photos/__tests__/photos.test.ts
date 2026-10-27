import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  decryptPhoto,
  encryptPhoto,
  generateDataKey,
  parseMasterKey,
  photoAad,
  unwrapDataKey,
  wrapDataKey,
} from "../crypto";
import { sniffImage, validateImage } from "../validate";

describe("photo envelope encryption", () => {
  const kek = randomBytes(32);

  it("round-trips a photo and never stores plaintext", () => {
    const dek = generateDataKey();
    const photo = randomBytes(2048);
    const aad = photoAad("user-1", "photo-1");
    const { iv, data } = encryptPhoto(photo, dek, aad);
    expect(data.includes(photo.subarray(0, 32))).toBe(false);
    expect(decryptPhoto(data, iv, dek, aad).equals(photo)).toBe(true);
  });

  it("refuses ciphertext moved to another user or row, or tampered with", () => {
    const dek = generateDataKey();
    const { iv, data } = encryptPhoto(Buffer.from("selfie"), dek, photoAad("user-1", "photo-1"));
    expect(() => decryptPhoto(data, iv, dek, photoAad("user-2", "photo-1"))).toThrow();
    expect(() => decryptPhoto(data, iv, dek, photoAad("user-1", "photo-2"))).toThrow();
    const tampered = Buffer.from(data);
    tampered[0] ^= 1;
    expect(() => decryptPhoto(tampered, iv, dek, photoAad("user-1", "photo-1"))).toThrow();
  });

  it("wraps data keys with the server key", () => {
    const dek = generateDataKey();
    const wrapped = wrapDataKey(dek, kek);
    expect(wrapped.startsWith("v1.")).toBe(true);
    expect(unwrapDataKey(wrapped, kek).equals(dek)).toBe(true);
    expect(() => unwrapDataKey(wrapped, randomBytes(32))).toThrow();
  });

  it("only accepts 32-byte base64 master keys", () => {
    expect(parseMasterKey(randomBytes(32).toString("base64"))).toHaveLength(32);
    expect(parseMasterKey(randomBytes(16).toString("base64"))).toBeNull();
    expect(parseMasterKey(undefined)).toBeNull();
  });
});

function jpeg(width: number, height: number): Uint8Array {
  // SOI, APP0 (JFIF, length 16), SOF0 with dimensions, EOI.
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]);
}

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}

describe("image validation", () => {
  it("identifies JPEG and PNG by their bytes and reads dimensions", () => {
    expect(sniffImage(jpeg(1024, 768))).toEqual({ mime: "image/jpeg", width: 1024, height: 768 });
    expect(sniffImage(png(800, 600))).toEqual({ mime: "image/png", width: 800, height: 600 });
  });

  it("rejects disguised, tiny, huge and empty files", () => {
    expect(validateImage(new TextEncoder().encode("<svg onload=alert(1)>")).ok).toBe(false);
    expect(validateImage(new Uint8Array()).ok).toBe(false);
    expect(validateImage(jpeg(200, 200)).ok).toBe(false);
    expect(validateImage(png(5000, 4000)).ok).toBe(false);
    expect(validateImage(jpeg(768, 1024)).ok).toBe(true);
  });
});
