import "server-only";
import { and, eq, lt } from "drizzle-orm";
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

async function dataKeyFor(userId: string, create: boolean): Promise<Buffer | null> {
  const kek = masterKey();
  if (!kek) return null;
  const [user] = await db.select({ photoKey: users.photoKey }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  if (user.photoKey) return unwrapDataKey(user.photoKey, kek);
  if (!create) return null;
  const dek = generateDataKey();
  await db.update(users).set({ photoKey: wrapDataKey(dek, kek), updatedAt: new Date() }).where(eq(users.id, userId));
  return dek;
}

async function purgeExpired(userId: string): Promise<void> {
  await db.delete(photos).where(and(eq(photos.userId, userId), lt(photos.expiresAt, new Date())));
}

/** Replaces the user's stored selfie with a new encrypted copy. */
export async function saveSelfie(userId: string, bytes: Buffer, mime: ImageMime): Promise<{ expiresAt: Date }> {
  const dek = await dataKeyFor(userId, true);
  if (!dek) throw new Error("Encrypted photo storage is not configured.");
  const id = crypto.randomUUID();
  const { iv, data } = encryptPhoto(bytes, dek, photoAad(userId, id));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
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

/** Deletes every stored photo and the user's data key, so any backup copies become unreadable. */
export async function deleteAllPhotos(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(photos).where(eq(photos.userId, userId));
    await tx.update(users).set({ photoKey: null, storePhotos: false, updatedAt: new Date() }).where(eq(users.id, userId));
  });
}
