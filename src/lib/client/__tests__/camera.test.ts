import { describe, expect, it } from "vitest";
import { cameraErrorMessage, canUseCamera } from "../camera";

const failure = (name: string) => new DOMException("camera failed", name);

describe("cameraErrorMessage", () => {
  it("explains a blocked camera and how to allow it", () => {
    for (const name of ["NotAllowedError", "SecurityError"]) expect(cameraErrorMessage(failure(name))).toMatch(/blocked.*address bar/);
  });

  it("points to Upload when there is no usable camera", () => {
    for (const name of ["NotFoundError", "OverconstrainedError"]) expect(cameraErrorMessage(failure(name))).toMatch(/No camera.*Upload/);
  });

  it("says when another app is using the camera", () => {
    for (const name of ["NotReadableError", "AbortError"]) expect(cameraErrorMessage(failure(name))).toMatch(/busy in another app/);
  });

  it("falls back to a general message for anything else", () => {
    for (const error of [new Error("boom"), "oops", undefined, null, { name: 42 }]) {
      expect(cameraErrorMessage(error)).toBe("The camera couldn't start. Try again, or use Upload instead.");
    }
  });
});

describe("canUseCamera", () => {
  it("is false where there's no camera API (here: Node)", () => {
    expect(canUseCamera()).toBe(false);
  });
});
