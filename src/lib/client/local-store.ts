"use client";

/**
 * Device-only storage for photos and previews (IndexedDB). Nothing here is sent to our servers.
 *
 * Every entry belongs to one account (the owner tag the server renders for whoever is signed in, see DeviceOwner) and
 * expires after 30 days. Entries of anyone else, or older ones, are never returned and get deleted. Signing out,
 * deleting the account and "Clear photos on this device" remove all its entries.
 */
const DB_NAME = "dyecast-private";
const STORE = "files";
/** Photos and previews on this device expire like stored selfies do. */
export const LOCAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const OWNER_META = "dyecast-owner";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? req.error);
      tx.onabort = () => reject(tx.error ?? new Error("Device photo storage was interrupted."));
    });
  } finally {
    db.close();
  }
}

export interface LocalEntry {
  blob: Blob;
  savedAt: number;
  /** For previews: which renderer made the image. */
  engine?: "youcam" | "device";
  /** Owner tag of the account that saved it. */
  owner: string;
}

/** The signed-in account's owner tag on this page, or "" when signed out. */
export function deviceOwner(): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${OWNER_META}"]`)?.content ?? "";
}

/** Whether an entry may be shown to the account signed in now. */
export function isUsable(entry: Pick<Partial<LocalEntry>, "owner" | "savedAt">, owner: string, now = Date.now()): boolean {
  return owner !== "" && entry.owner === owner && typeof entry.savedAt === "number" &&
    Number.isFinite(entry.savedAt) && entry.savedAt <= now && now - entry.savedAt < LOCAL_MAX_AGE_MS;
}

export async function putLocal(key: string, entry: LocalEntry): Promise<void> {
  if (!isUsable(entry, deviceOwner())) throw new Error("Your account changed. Reload before saving a photo.");
  await run("readwrite", (s) => s.put(entry, `${entry.owner}:${key}`));
}

export async function getLocal(key: string): Promise<LocalEntry | undefined> {
  const owner = deviceOwner();
  if (!owner) return undefined;
  const scoped = `${owner}:${key}`;
  const entry = await run<LocalEntry | undefined>("readonly", (s) => s.get(scoped));
  if (!entry) return undefined;
  if (isUsable(entry, deviceOwner())) return entry;
  await run("readwrite", (s) => s.delete(scoped));
  return undefined;
}

export async function deleteLocal(key: string): Promise<void> {
  await run("readwrite", (s) => s.delete(`${deviceOwner()}:${key}`));
}

/** Removes every photo and preview on this device. */
export async function clearLocal(): Promise<void> {
  // Clearing in a committed transaction works even while another tab has the database open.
  await run("readwrite", (s) => s.clear());
}

/** Keeps only the signed-in account's recent entries; with nobody signed in, removes everything. */
export async function tidyLocal(owner: string): Promise<void> {
  if (!owner) return clearLocal();
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const cursor = tx.objectStore(STORE).openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return;
        if (!isUsable(c.value as LocalEntry, owner)) c.delete();
        c.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const SELFIE_KEY = "selfie";
export const renderKey = (checkId: string, variant: string) => `render:${checkId}:${variant}`;
