"use client";

/**
 * Device-only storage for photos and previews (IndexedDB). Nothing here is sent to our servers;
 * "Clear this device" in Settings removes it all.
 */
const DB_NAME = "dyecast-private";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export interface LocalEntry {
  blob: Blob;
  savedAt: number;
  /** YouCam file id for this photo, if it was analyzed (valid for a limited time). */
  fileId?: string;
}

export async function putLocal(key: string, entry: LocalEntry): Promise<void> {
  await run("readwrite", (s) => s.put(entry, key));
}

export async function getLocal(key: string): Promise<LocalEntry | undefined> {
  try {
    return await run<LocalEntry | undefined>("readonly", (s) => s.get(key));
  } catch {
    return undefined;
  }
}

export async function deleteLocal(key: string): Promise<void> {
  await run("readwrite", (s) => s.delete(key));
}

export async function clearLocal(): Promise<void> {
  await run("readwrite", (s) => s.clear());
}

export const SELFIE_KEY = "selfie";
export const renderKey = (checkId: string, variant: string) => `render:${checkId}:${variant}`;
