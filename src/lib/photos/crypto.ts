import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Envelope encryption for user photos.
 * - Each user has a random 256-bit data key (DEK) that encrypts their photos with AES-256-GCM.
 * - The DEK is stored wrapped (encrypted) with the server key (KEK) from PHOTO_ENCRYPTION_KEY.
 * - Every photo binds its owner and id as additional authenticated data, so ciphertext can't be
 *   swapped between users or rows without failing authentication.
 * - Deleting a user's wrapped DEK makes their photos unreadable from then on. Copies in older database backups still
 *   need the KEK, which is never stored in the database.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const WRAP_AAD = Buffer.from("dyecast:photo-dek:v1");

export function parseMasterKey(value: string | undefined): Buffer | null {
  if (!value) return null;
  const key = Buffer.from(value.trim(), "base64");
  return key.length === 32 ? key : null;
}

/** Server key from the environment, or null when encrypted photo storage is not configured. */
export function masterKey(): Buffer | null {
  return parseMasterKey(process.env.PHOTO_ENCRYPTION_KEY);
}

export function generateDataKey(): Buffer {
  return randomBytes(32);
}

function seal(plain: Buffer, key: Buffer, aad: Buffer): { iv: Buffer; sealed: Buffer } {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad);
  const sealed = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  return { iv, sealed };
}

function open(sealed: Buffer, key: Buffer, iv: Buffer, aad: Buffer): Buffer {
  if (sealed.length < TAG_BYTES) throw new Error("Ciphertext is too short.");
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(aad);
  decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
  return Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - TAG_BYTES)), decipher.final()]);
}

/** Wraps a data key as "v1.<iv>.<ciphertext+tag>" (base64url). */
export function wrapDataKey(dataKey: Buffer, kek: Buffer): string {
  const { iv, sealed } = seal(dataKey, kek, WRAP_AAD);
  return `v1.${iv.toString("base64url")}.${sealed.toString("base64url")}`;
}

export function unwrapDataKey(wrapped: string, kek: Buffer): Buffer {
  const [version, iv, sealed] = wrapped.split(".");
  if (version !== "v1" || !iv || !sealed) throw new Error("Unsupported wrapped key format.");
  return open(Buffer.from(sealed, "base64url"), kek, Buffer.from(iv, "base64url"), WRAP_AAD);
}

export function photoAad(userId: string, photoId: string): Buffer {
  return Buffer.from(`dyecast:photo:v1:${userId}:${photoId}`);
}

export function encryptPhoto(plain: Buffer, dataKey: Buffer, aad: Buffer): { iv: string; data: Buffer } {
  const { iv, sealed } = seal(plain, dataKey, aad);
  return { iv: iv.toString("base64url"), data: sealed };
}

export function decryptPhoto(data: Buffer, iv: string, dataKey: Buffer, aad: Buffer): Buffer {
  return open(data, dataKey, Buffer.from(iv, "base64url"), aad);
}
