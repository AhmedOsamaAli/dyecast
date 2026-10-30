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
  return {
    client: null as Client | null,
    remaining: 1000,
    created: 0,
    failCreate: 0,
    failDelete: false,
    deleted: [] as string[],
    /** What YouCam says about a task: its status, or that it's gone (404) or unreachable (503). */
    remote: {} as Record<string, "running" | "success" | "error" | "gone" | "down">,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const schema = await import("@/lib/db/schema");
  state.client = createClient({ url: "file::memory:" });
  return { db: drizzle({ client: state.client, schema }) };
});
vi.mock("@/lib/youcam/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/youcam/client")>();
  return {
    ...original,
    createTask: vi.fn(async () => {
      if (state.failCreate > 0) {
        state.failCreate--;
        throw new original.YouCamError("busy", "http_503", 503, true);
      }
      return `task_${++state.created}`;
    }),
    getRemainingUnits: vi.fn(async () => state.remaining),
    getTask: vi.fn(async (_feature: string, taskId: string) => {
      const status = state.remote[taskId] ?? "success";
      if (status === "gone") throw new original.YouCamError("not found", "http_404", 404, false);
      if (status === "down") throw new original.YouCamError("down", "http_503", 503, true);
      return { status };
    }),
    deleteTask: vi.fn(async (taskId: string) => {
      if (state.failDelete) throw new original.YouCamError("down", "http_503", 503, true);
      state.deleted.push(taskId);
    }),
  };
});

import { db } from "@/lib/db/client";
import { apiUsage, users } from "@/lib/db/schema";
import {
  forgetUserTasks,
  releaseReservation,
  reserveUnits,
  startReserved,
  startTask,
  sweepStaleTasks,
  unitsUsedToday,
} from "@/lib/youcam/service";

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
  state.failCreate = 0;
  state.failDelete = false;
  state.deleted = [];
  state.remote = {};
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

  it("does not spend a cached account balance twice across parallel requests", async () => {
    state.remaining = 65;
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => startTask("ana", "hair-color", body)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(await unitsUsedToday("ana")).toBe(5);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "global_floor" } });
  });

  it("reserves complete multi-feature groups under concurrent shared-budget contention", async () => {
    const results = await Promise.allSettled([
      reserveUnits("ana", ["skin-tone-analysis", "hair-length-detection"]),
      reserveUnits("ana", ["skin-tone-analysis", "hair-length-detection"]),
      reserveUnits("ben", ["skin-tone-analysis", "hair-length-detection"]),
      reserveUnits("ben", ["skin-tone-analysis", "hair-length-detection"]),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const held = await db.select().from(apiUsage);
    expect(held).toHaveLength(6);
    expect(held.reduce((sum, r) => sum + r.units, 0)).toBe(66);
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

  it("holds units in one atomic step, so parallel requests can't overshoot the caps", async () => {
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => startTask("ana", "skin-tone-analysis", body)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "daily_budget" } });
    expect(await unitsUsedToday("ana")).toBe(40);
  });

  it("holds a whole analysis or none of it, before anything is uploaded", async () => {
    await startTask("ana", "skin-tone-analysis", body);
    const holds = await reserveUnits("ana", ["skin-tone-analysis", "hair-length-detection", "hair-density-detection"]);
    expect(holds).toHaveLength(3);
    expect(await unitsUsedToday("ana")).toBe(43);
    await expect(reserveUnits("ana", ["skin-tone-analysis", "hair-length-detection"])).rejects.toMatchObject({ code: "daily_budget" });
    expect(await unitsUsedToday("ana")).toBe(43);
    // A started task keeps its units; holds that never became a task are refunded.
    await startReserved(holds[0], body);
    await Promise.all(holds.map(releaseReservation));
    expect(await unitsUsedToday("ana")).toBe(40);
  });

  it("refunds the hold when YouCam won't start the task", async () => {
    state.failCreate = 1;
    await expect(startTask("ana", "skin-tone-analysis", body)).rejects.toMatchObject({ httpStatus: 503 });
    expect(await unitsUsedToday("ana")).toBe(0);
    expect(await db.select().from(apiUsage)).toHaveLength(0);
  });
});

describe("YouCam cleanup", () => {
  const row = (taskId: string, over: Partial<typeof apiUsage.$inferInsert> = {}): typeof apiUsage.$inferInsert => ({
    id: crypto.randomUUID(),
    userId: "ana",
    feature: "skin-tone-analysis",
    units: 20,
    taskId,
    status: "created",
    mock: false,
    createdAt: new Date(Date.now() - 60 * 60 * 1000),
    ...over,
  });

  it("deletes what the normal flow left behind, and keeps recent or unreachable tasks for the next run", async () => {
    await db.insert(apiUsage).values([
      row("pending_hold"),
      row("t_abandoned"),
      row("t_failed"),
      row("t_render", { feature: "hair-color", units: 1, status: "success", resultUrl: "https://x.makeupar.com/r.jpg" }),
      row("t_gone"),
      row("t_down"),
      row("t_recent", { createdAt: new Date() }),
      row("t_done", { status: "success", deletedAt: new Date() }),
    ]);
    state.remote = { t_failed: "error", t_gone: "gone", t_down: "down" };
    expect(await sweepStaleTasks()).toEqual({ deleted: 4, released: 1, pending: 1 });
    expect(state.deleted.sort()).toEqual(["t_abandoned", "t_failed", "t_render"]);
    const rows = Object.fromEntries((await db.select().from(apiUsage)).map((r) => [r.taskId, r]));
    expect(rows.pending_hold).toBeUndefined();
    expect(rows.t_abandoned.status).toBe("success");
    expect(rows.t_failed).toMatchObject({ status: "error", units: 0 });
    expect(rows.t_render.resultUrl).toBeNull();
    expect(rows.t_render.deletedAt).not.toBeNull();
    expect(rows.t_gone.status).toBe("success");
    expect(rows.t_down.status).toBe("created");
    expect(rows.t_recent.status).toBe("created");
  });

  it("retries failed deletions, including finished analysis tasks without a render URL", async () => {
    await db.insert(apiUsage).values([
      row("t_analysis_retry", { status: "success" }),
      row("t_error_retry", { status: "error", units: 0 }),
      row("t_auth_problem"),
    ]);
    state.failDelete = true;
    state.remote.t_auth_problem = "down";
    expect(await sweepStaleTasks()).toEqual({ deleted: 0, released: 0, pending: 3 });
    expect((await db.select().from(apiUsage)).every((r) => r.deletedAt === null)).toBe(true);

    state.failDelete = false;
    delete state.remote.t_auth_problem;
    expect(await sweepStaleTasks()).toEqual({ deleted: 3, released: 0, pending: 0 });
    expect((await db.select().from(apiUsage)).every((r) => r.deletedAt !== null)).toBe(true);
    expect(await sweepStaleTasks()).toEqual({ deleted: 0, released: 0, pending: 0 });
  });

  it("deletes every YouCam task of an account being deleted, and only that account's", async () => {
    const tone = await startTask("ana", "skin-tone-analysis", body);
    const render = await startTask("ana", "hair-color", body);
    await reserveUnits("ana", ["hair-length-detection"]);
    await startTask("ben", "skin-tone-analysis", body);
    await db.update(apiUsage).set({ resultUrl: "https://x.makeupar.com/r.jpg" }).where(eq(apiUsage.taskId, render.taskId));
    await forgetUserTasks("ana");
    expect(state.deleted.sort()).toEqual([tone.taskId, render.taskId].sort());
    const left = await db.select().from(apiUsage).where(eq(apiUsage.userId, "ana"));
    expect(left.map((r) => r.taskId).sort()).toEqual([tone.taskId, render.taskId].sort());
    expect(left.every((r) => r.resultUrl === null)).toBe(true);
    expect(await unitsUsedToday("ben")).toBe(20);
  });
});
