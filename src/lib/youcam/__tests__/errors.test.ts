import { describe, expect, it } from "vitest";
import { requestErrorMessage, taskErrorMessage } from "../errors";

describe("YouCam error messages", () => {
  it("turns task error codes into plain advice, never YouCam's own text", () => {
    expect(taskErrorMessage("error_no_face")).toMatch(/couldn't find a face/);
    expect(taskErrorMessage("error_face_angle_leftward")).toMatch(/Face the camera straight on/);
    expect(taskErrorMessage("error_face_position_too_small")).toMatch(/closer/);
    expect(taskErrorMessage("error_insufficient_lighting")).toMatch(/too dark/);
    expect(taskErrorMessage("Internal: stack trace at worker-7")).toMatch(/couldn't be analyzed/);
    expect(taskErrorMessage(undefined)).toMatch(/couldn't be analyzed/);
  });

  it("explains failed requests by kind", () => {
    expect(requestErrorMessage(429)).toMatch(/busy/);
    expect(requestErrorMessage(502)).toMatch(/having trouble/);
    expect(requestErrorMessage(400)).toMatch(/couldn't take that request/);
  });
});
