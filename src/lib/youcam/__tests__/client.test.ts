import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { deleteTask, getTask } from "../client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function respond(body: unknown, status = 200) {
  vi.stubEnv("YOUCAM_API_KEY", "unit-test-key");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(body, { status })));
}

describe("YouCam response validation", () => {
  it("recognizes the documented HTTP 400 response for an absent task", async () => {
    respond({ status: 400, error_code: "InvalidTaskId" }, 400);
    await expect(deleteTask("removed-task")).rejects.toMatchObject({ code: "task_not_found", httpStatus: 400 });
    respond({ status: 400, error: "Invalid task ID" }, 400);
    await expect(getTask("hair-color", "expired-task")).rejects.toMatchObject({ code: "task_not_found" });
  });

  it("does not mistake busy or malformed deletion responses for confirmation", async () => {
    respond({ status: 400, error_code: "OperationInvalid" }, 400);
    await expect(deleteTask("running-task")).rejects.toMatchObject({ code: "photo_service" });
    respond({});
    await expect(deleteTask("task")).rejects.toMatchObject({ code: "deletion_unconfirmed" });
    respond({ status: 200 });
    await expect(deleteTask("task")).resolves.toBeUndefined();
  });

  it("rejects error envelopes and missing task statuses rather than reporting endless progress", async () => {
    respond({ status: 500, error: "internal provider detail" });
    await expect(getTask("hair-color", "task")).rejects.toMatchObject({ code: "photo_service", httpStatus: 500 });
    respond({ status: 200, data: {} });
    await expect(getTask("hair-color", "task")).rejects.toMatchObject({ code: "bad_task_response" });
  });
});
