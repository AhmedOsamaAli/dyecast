import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

const request = vi.hoisted(() => {
  process.env.PHOTO_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  return { cookies: new Map<string, string>(), client: null as Client | null };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = request.cookies.get(name);
      return value ? { value } : undefined;
    },
    set: (name: string, value: string) => { request.cookies.set(name, value); },
    delete: (name: string) => { request.cookies.delete(name); },
  }),
  headers: async () => new Headers({ "user-agent": "DyeCast integration test" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/client", async () => {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const schema = await import("@/lib/db/schema");
  request.client = createClient({ url: "file::memory:" });
  return { db: drizzle({ client: request.client, schema }) };
});

import { db } from "@/lib/db/client";
import { hairProfiles, oauthAccounts, photos, rateLimits, savedChecks, sessions, users } from "@/lib/db/schema";
import { login, logout, register } from "@/app/auth-actions";
import { saveProfile } from "@/app/profile/actions";
import { createCheck, deleteCheck } from "@/app/check/actions";
import { deleteAccount, updateAccount } from "@/app/settings/actions";
import CheckPage from "@/app/checks/[id]/page";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth/session";
import { sha256 } from "@/lib/auth/crypto";
import { upsertGoogleUser } from "@/lib/auth/google";
import { deleteAllPhotos, loadSelfie, saveSelfie, selfieInfo } from "@/lib/photos/store";
import { DEFAULT_PROFILE } from "../validation";

function form(values: Record<string, unknown>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) data.set(key, String(value));
  return data;
}

async function signup(email = "sara@example.com") {
  await expect(register({}, form({ displayName: " Sara ", email, password: "my secure password" })))
    .rejects.toThrow("REDIRECT:/check");
}

async function saveDefaultProfile(overrides: Record<string, unknown> = {}) {
  await expect(saveProfile({}, form({ ...DEFAULT_PROFILE, ...overrides }))).rejects.toThrow("REDIRECT:/check?profile=saved");
}

const target = { shadeCode: "9.1", product: "permanent", system: "international", source: "code" };
const page = (id: string) => CheckPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });

beforeAll(async () => {
  await request.client!.execute("PRAGMA foreign_keys = ON");
  await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
});

beforeEach(async () => {
  request.cookies.clear();
  await db.delete(users);
  await db.delete(rateLimits);
});

afterAll(() => { request.client?.close(); });

describe("email accounts", () => {
  it("registers with normalized identity, hashed password and a hashed session token", async () => {
    await signup(" Sara@Example.COM ");
    const [user] = await db.select().from(users);
    const [session] = await db.select().from(sessions);
    expect(user.email).toBe("sara@example.com");
    expect(user.displayName).toBe("Sara");
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(session.id).toBe(sha256(request.cookies.get(SESSION_COOKIE)!));
    const safeUser = await getCurrentUser();
    expect(safeUser?.id).toBe(user.id);
    expect(safeUser).not.toHaveProperty("passwordHash");
  });

  it("rejects duplicate registration and invalid credentials without creating sessions", async () => {
    await signup();
    await logout().catch((error: unknown) => { expect(String(error)).toContain("REDIRECT:/"); });
    expect((await register({}, form({ displayName: "Other", email: "SARA@example.com", password: "another password" }))).error).toBeTruthy();
    expect((await login({}, form({ email: "sara@example.com", password: "wrong password" }))).error).toBe("Email or password is incorrect.");
    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(sessions)).toHaveLength(0);
    await expect(login({}, form({ email: "SARA@example.com", password: "my secure password" }))).rejects.toThrow("REDIRECT:/check");
  });

  it("limits unsuccessful login attempts for the same normalized email", async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await login({}, form({ email: "missing@example.com", password: "wrong" }))).error).toBe("Email or password is incorrect.");
    }
    expect((await login({}, form({ email: "MISSING@example.com", password: "wrong" }))).error).toContain("Too many attempts");
  });

  it("rejects invalid registration without writing an account", async () => {
    const result = await register({}, form({ displayName: "", email: "bad", password: "tiny" }));
    expect(result.fields).toHaveProperty("email");
    expect(await db.select().from(users)).toHaveLength(0);
  });
});

describe("Google accounts", () => {
  it("creates a password-less verified account once and reuses it", async () => {
    const claims = { sub: "google-123", email: "lina@example.com", name: "Lina" };
    const first = await upsertGoogleUser(claims);
    const second = await upsertGoogleUser(claims);
    expect(first).toMatchObject({ created: true, secured: false });
    expect(second).toEqual({ userId: first.userId, created: false, secured: false });
    const [user] = await db.select().from(users);
    expect(user).toMatchObject({ email: "lina@example.com", passwordHash: null, emailVerified: true });
    expect(await db.select().from(oauthAccounts)).toHaveLength(1);
    expect((await login({}, form({ email: "lina@example.com", password: "anything at all" }))).error).toBe("Email or password is incorrect.");
  });

  it("links an unverified email account but drops its password and sessions (pre-hijacking defence)", async () => {
    await signup("sara@example.com");
    const [existing] = await db.select().from(users);
    expect(existing.emailVerified).toBe(false);
    expect(await db.select().from(sessions)).toHaveLength(1);

    const linked = await upsertGoogleUser({ sub: "google-sara", email: "sara@example.com", name: "Sara G" });
    expect(linked).toEqual({ userId: existing.id, created: false, secured: true });
    const [user] = await db.select().from(users);
    expect(user).toMatchObject({ emailVerified: true, passwordHash: null, displayName: "Sara" });
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect((await login({}, form({ email: "sara@example.com", password: "my secure password" }))).error).toBe("Email or password is incorrect.");

    expect(await upsertGoogleUser({ sub: "google-sara", email: "sara@example.com", name: "Sara G" }))
      .toEqual({ userId: existing.id, created: false, secured: false });
  });

  it("links a second Google identity to an already verified account without touching its password", async () => {
    await upsertGoogleUser({ sub: "google-first", email: "noor@example.com", name: "Noor" });
    const [verified] = await db.select().from(users);
    await db.update(users).set({ passwordHash: "scrypt$kept" }).where(eq(users.id, verified.id));
    const linked = await upsertGoogleUser({ sub: "google-second", email: "noor@example.com", name: "Noor" });
    expect(linked).toEqual({ userId: verified.id, created: false, secured: false });
    const [user] = await db.select().from(users);
    expect(user.passwordHash).toBe("scrypt$kept");
    expect(await db.select().from(oauthAccounts)).toHaveLength(2);
  });
});

describe("profile and checks", () => {
  it("requires a session for writes", async () => {
    await expect(saveProfile({}, form(DEFAULT_PROFILE))).rejects.toThrow("REDIRECT:/login");
    await expect(createCheck({}, form(target))).rejects.toThrow("REDIRECT:/login");
    await expect(deleteCheck("not-owned")).rejects.toThrow("REDIRECT:/login");
  });

  it("saves every manual characteristic plus photo suggestions", async () => {
    await signup();
    const selected = {
      ...DEFAULT_PROFILE, lengthsLevel: 7.5, naturalLevel: 3, currentTone: "warm",
      history: "highlighted", texture: "coily", thickness: "fine", ends: "dry", gray: "some",
      length: "very-long", density: "high",
    };
    const measurement = { measuredHex: "#7a5532", youcamHairClass: "Brown", mock: true, analyzedAt: "2026-10-27T10:00:00Z" };
    await saveDefaultProfile({ ...selected, measurement: JSON.stringify(measurement) });
    const [saved] = await db.select().from(hairProfiles);
    expect(saved.profile).toEqual({ ...selected, measurement });
    expect(await db.select().from(savedChecks)).toHaveLength(0);
  });

  it("asks for a profile before the first check and rejects invalid input", async () => {
    await signup();
    expect((await createCheck({}, form(target))).error).toBe("Create your hair profile first.");
    expect((await saveProfile({}, form({ ...DEFAULT_PROFILE, lengthsLevel: 99 }))).fields).toHaveProperty("lengthsLevel");
    await saveDefaultProfile();
    expect((await createCheck({}, form({ ...target, shadeCode: "not a shade" }))).error).toBeTruthy();
    expect((await createCheck({}, form({ ...target, productUrl: "file:///etc/passwd", source: "link" }))).fields).toHaveProperty("productUrl");
    expect(await db.select().from(savedChecks)).toHaveLength(0);
  });

  it("stores goal checks with their route and keeps immutable snapshots per account", async () => {
    await signup();
    await saveDefaultProfile();
    await expect(createCheck({}, form({ ...target, shadeCode: "8.1", source: "goal", goalHex: "#c9b08a", goalName: "Ash blonde", tonerCode: "9.1" })))
      .rejects.toThrow("REDIRECT:/checks/");
    const [saved] = await db.select().from(savedChecks);
    expect(saved.input).toMatchObject({ lengthsLevel: 4, source: "goal", goalHex: "#c9b08a", tonerCode: "9.1" });
    expect(saved.report.paths?.goalHex).toBe("#c9b08a");
    expect(await page(saved.id)).toBeTruthy();

    await saveDefaultProfile({ lengthsLevel: 6, naturalLevel: 6 });
    const [snapshot] = await db.select().from(savedChecks);
    expect(snapshot.input.lengthsLevel).toBe(4);

    await signup("second@example.com");
    await expect(page(saved.id)).rejects.toThrow("NOT_FOUND");
    await expect(deleteCheck(saved.id)).rejects.toThrow("NOT_FOUND");
    expect(await db.select().from(savedChecks)).toHaveLength(1);

    request.cookies.clear();
    await expect(login({}, form({ email: "sara@example.com", password: "my secure password" }))).rejects.toThrow("REDIRECT:/check");
    await expect(deleteCheck(saved.id)).rejects.toThrow("REDIRECT:/history");
    expect(await db.select().from(savedChecks)).toHaveLength(0);
  });
});

describe("photo storage and account deletion", () => {
  it("encrypts stored selfies per user and crypto-shreds them on deletion", async () => {
    await signup();
    const user = (await getCurrentUser())!;
    const selfie = randomBytes(4096);
    await saveSelfie(user.id, selfie, "image/jpeg");
    const [row] = await db.select().from(photos);
    expect(row.data.includes(selfie.subarray(0, 64))).toBe(false);
    expect((await loadSelfie(user.id))?.bytes.equals(selfie)).toBe(true);
    expect((await selfieInfo(user.id))?.bytes).toBe(4096);

    await signup("second@example.com");
    const other = (await getCurrentUser())!;
    expect(await loadSelfie(other.id)).toBeNull();

    await deleteAllPhotos(user.id);
    expect(await db.select().from(photos)).toHaveLength(0);
    const [owner] = await db.select().from(users).where(eq(users.id, user.id));
    expect(owner.photoKey).toBeNull();
  });

  it("turning photo storage off deletes stored photos", async () => {
    await signup();
    const user = (await getCurrentUser())!;
    expect((await updateAccount({}, form({ displayName: "Sara", storePhotos: "on" }))).message).toContain("encrypted");
    await saveSelfie(user.id, randomBytes(1024), "image/png");
    expect((await updateAccount({}, form({ displayName: "Sara" }))).message).toContain("No photos");
    expect(await db.select().from(photos)).toHaveLength(0);
  });

  it("deletes the account and all its data only after typed confirmation", async () => {
    await signup();
    await saveDefaultProfile();
    await expect(createCheck({}, form(target))).rejects.toThrow("REDIRECT:/checks/");
    expect((await deleteAccount({}, form({ confirm: "nope" }))).error).toBeTruthy();
    await expect(deleteAccount({}, form({ confirm: "delete" }))).rejects.toThrow("REDIRECT:/?notice=account_deleted");
    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(hairProfiles)).toHaveLength(0);
    expect(await db.select().from(savedChecks)).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(request.cookies.has(SESSION_COOKIE)).toBe(false);
  });
});
