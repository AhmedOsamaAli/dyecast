import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { join } from "node:path";

const state = vi.hoisted(() => {
  process.env.YOUCAM_API_KEY = "test-key";
  process.env.YOUCAM_MOCK = "0";
  process.env.YOUCAM_DAILY_UNITS_PER_USER = "45";
  process.env.YOUCAM_DAILY_UNITS_TOTAL = "70";
  process.env.YOUCAM_MIN_REMAINING_UNITS = "60";
  return { client: null as Client | null, remaining: 1000, created: 0 };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const schema = await import("@/lib/db/schema");
  state.client = createClient({ url: "file::memory:" });
  return { db: drizzle({ client: state.client, schema }) };
});
vi.mock("@/lib/youcam/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/youcam/client")>()),
  createTask: vi.fn(async () => `task_${++state.created}`),
  getRemainingUnits: vi.fn(async () => state.remaining),
}));

import { db } from "@/lib/db/client";
import { apiUsage, users } from "@/lib/db/schema";
import { startTask, unitsUsedToday } from "@/lib/youcam/service";

const body = { src_file_id: "file_real" };

async function addUser(id: string) {
  await db.insert(users).values({ id, email: `${id}@example.com`, displayName: id, createdAt: new Date(), updatedAt: new Date() });
}

beforeAll(async () => {
  // The account balance is cached for a minute; every test starts two (fake) minutes later.
  vi.useFakeTimers({ toFake: ["Date"] });
  await state.client!.execute("PRAGMA foreign_keys = ON");
  await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
});

beforeEach(async () => {
  vi.setSystemTime(Date.now() + 120_000);
  await db.delete(apiUsage);
  await db.delete(users);
  state.remaining = 1000;
  await addUser("ana");
  await addUser("ben");
});

afterAll(() => {
  vi.useRealTimers();
  state.client?.close();
});

describe("YouCam budget guards", () => {
  it("records real units per task and stops a user at the daily cap", async () => {
    await startTask("ana", "skin-tone-analysis", body);
    await startTask("ana", "skin-tone-analysis", body);
    expect(await unitsUsedToday("ana")).toBe(40);
    await expect(startTask("ana", "hair-length-detection", body)).resolves.toMatchObject({ mock: false });
    await expect(startTask("ana", "skin-tone-analysis", body)).rejects.toMatchObject({ code: "daily_budget", httpStatus: 429 });
  });

  it("caps all users together so sign-ups can't drain the account", async () => {
    await startTask("ana", "skin-tone-analysis", body);
    await startTask("ana", "skin-tone-analysis", body);
    await startTask("ben", "skin-tone-analysis", body);
    expect(await unitsUsedToday("ben")).toBe(20);
    await expect(startTask("ben", "skin-tone-analysis", body)).rejects.toMatchObject({ code: "global_daily_budget", httpStatus: 503 });
    await expect(startTask("ben", "hair-color", body)).resolves.toMatchObject({ mock: false });
  });

  it("keeps a reserve of units that is never spent", async () => {
    state.remaining = 75;
    await expect(startTask("ana", "skin-tone-analysis", body)).rejects.toMatchObject({ code: "global_floor" });
  });

  it("ignores failed tasks, and deleting an account doesn't reset the shared daily total", async () => {
    await startTask("ana", "skin-tone-analysis", body);
    await db.update(apiUsage).set({ status: "error" });
    expect(await unitsUsedToday("ana")).toBe(0);

    await startTask("ben", "skin-tone-analysis", body);
    await startTask("ben", "skin-tone-analysis", body);
    await db.delete(users).where(eq(users.id, "ben"));
    await addUser("ben");
    expect(await unitsUsedToday("ben")).toBe(0);
    await startTask("ben", "skin-tone-analysis", body);
    await expect(startTask("ben", "skin-tone-analysis", body)).rejects.toMatchObject({ code: "global_daily_budget" });
  });

  it("demo-mode files never spend units", async () => {
    state.remaining = 0;
    await expect(startTask("ana", "skin-tone-analysis", { src_file_id: "mock_file_1" })).resolves.toMatchObject({ mock: true });
    expect(await unitsUsedToday("ana")).toBe(0);
  });
});
