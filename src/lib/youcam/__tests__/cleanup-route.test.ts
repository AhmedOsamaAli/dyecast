import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/photos/store", () => ({ purgeAllExpired: vi.fn(async () => 2) }));
vi.mock("@/lib/auth/rate-limit", () => ({ purgeOldRateLimits: vi.fn(async () => {}) }));
vi.mock("@/lib/youcam/service", () => ({
  sweepStaleTasks: vi.fn(async () => ({ deleted: 3, released: 1, pending: 0 })),
}));

import { GET } from "@/app/api/cron/cleanup/route";
import { purgeAllExpired } from "@/lib/photos/store";
import { sweepStaleTasks } from "@/lib/youcam/service";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("scheduled photo cleanup", () => {
  it("rejects requests when unconfigured, unsigned, or signed with the wrong secret", async () => {
    for (const secret of ["", "unit-test-secret"]) {
      vi.stubEnv("CRON_SECRET", secret);
      for (const authorization of ["", "Bearer wrong-secret"]) {
        expect((await GET(new Request("https://example.com/api/cron/cleanup", { headers: { authorization } }))).status).toBe(401);
      }
    }
    expect(purgeAllExpired).not.toHaveBeenCalled();
    expect(sweepStaleTasks).not.toHaveBeenCalled();
  });

  it("runs both cleanups only for an authenticated scheduler request", async () => {
    vi.stubEnv("CRON_SECRET", "unit-test-secret");
    const response = await GET(new Request("https://example.com/api/cron/cleanup", {
      headers: { authorization: "Bearer unit-test-secret" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ photosDeleted: 2, youcam: { deleted: 3, released: 1, pending: 0 } });
  });
});
