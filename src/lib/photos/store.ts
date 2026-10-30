import "server-only";
import { and, eq, isNotNull, lt, notExists } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { photos, users } from "@/lib/db/schema";
import {
  decryptPhoto,
  encryptPhoto,
  generateDataKey,
  masterKey,
  photoAad,
  unwrapDataKey,
  wrapDataKey,
} from "./crypto";
import type { ImageMime } from "./validate";

export const PHOTO_RETENTION_DAYS = 30;

export function photoStorageAvailable(): boolean {
  return masterKey() !== null;
}

async function dataKeyFor(userId: string, create: boolean, query: Pick<typeof db, "select" | "update"> = db): Promise<Buffer | null> {
  const kek = masterKey();
  if (!kek) return null;
  const [user] = await query.select({ photoKey: users.photoKey }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  if (user.photoKey) return unwrapDataKey(user.photoKey, kek);
  if (!create) return null;
  const dek = generateDataKey();
  await query.update(users).set({ photoKey: wrapDataKey(dek, kek), updatedAt: new Date() }).where(eq(users.id, userId));
  return dek;
}

async function purgeExpired(userId: string): Promise<void> {
  await db.delete(photos).where(and(eq(photos.userId, userId), lt(photos.expiresAt, new Date())));
}

/**
 * Daily cleanup: deletes every expired photo, then the data key of anyone left with no photos, so nothing outlives
 * the 30 days even if its owner never comes back. Returns how many photos were deleted.
 */
export async function purgeAllExpired(now = new Date()): Promise<number> {
  const expired = await db.delete(photos).where(lt(photos.expiresAt, now)).returning({ id: photos.id });
  await db
    .update(users)
    .set({ photoKey: null, updatedAt: now })
    .where(and(isNotNull(users.photoKey), notExists(db.select({ id: photos.id }).from(photos).where(eq(photos.userId, users.id)))));
  return expired.length;
}

/** Replaces the user's stored selfie with a new encrypted copy. */
export async function saveSelfie(userId: string, bytes: Buffer, mime: ImageMime): Promise<{ expiresAt: Date }> {
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    // Keep key creation and photo insertion together so a cleanup cannot discard the key between them.
    const dek = await dataKeyFor(userId, true, tx);
    if (!dek) throw new Error("Encrypted photo storage is not configured.");
    const { iv, data } = encryptPhoto(bytes, dek, photoAad(userId, id));
    await tx.delete(photos).where(and(eq(photos.userId, userId), eq(photos.kind, "selfie")));
    await tx.insert(photos).values({ id, userId, kind: "selfie", mime, bytes: bytes.byteLength, iv, data, createdAt: now, expiresAt });
  });
  return { expiresAt };
}

export interface StoredSelfieInfo {
  id: string;
  bytes: number;
  createdAt: Date;
  expiresAt: Date;
}

export async function selfieInfo(userId: string): Promise<StoredSelfieInfo | null> {
  await purgeExpired(userId);
  const [row] = await db
    .select({ id: photos.id, bytes: photos.bytes, createdAt: photos.createdAt, expiresAt: photos.expiresAt })
    .from(photos)
    .where(and(eq(photos.userId, userId), eq(photos.kind, "selfie")))
    .limit(1);
  return row ?? null;
}

export async function loadSelfie(userId: string): Promise<{ bytes: Buffer; mime: ImageMime } | null> {
  await purgeExpired(userId);
  const [row] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.userId, userId), eq(photos.kind, "selfie")))
    .limit(1);
  if (!row) return null;
  const dek = await dataKeyFor(userId, false);
  if (!dek) return null;
  return { bytes: decryptPhoto(row.data, row.iv, dek, photoAad(userId, row.id)), mime: row.mime };
}

/**
 * Deletes every stored photo and the user's data key. The photos can't be read without that key, and the key itself
 * is encrypted with a server key that is never stored in the database.
 */
export async function deleteAllPhotos(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(photos).where(eq(photos.userId, userId));
    await tx.update(users).set({ photoKey: null, storePhotos: false, updatedAt: new Date() }).where(eq(users.id, userId));
  });
}
