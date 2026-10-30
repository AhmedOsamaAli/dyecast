import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_ASSETS, contentSecurityPolicy } from "../csp";

const installed = (name: string) =>
  (JSON.parse(readFileSync(join(process.cwd(), "node_modules", name, "package.json"), "utf8")) as { version: string }).version;

describe("content security policy", () => {
  const policy = contentSecurityPolicy("abc123", false);
  const directive = (name: string) => policy.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

  it("runs inline scripts only with this request's nonce", () => {
    expect(directive("script-src")).toContain("'nonce-abc123'");
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
    expect(directive("script-src")).not.toContain("'unsafe-eval'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("self-hosts AI executable assets and permits only pinned remote model data", () => {
    for (const name of ["script-src", "connect-src", "worker-src"]) {
      expect(directive(name)).not.toMatch(/https:\/\/cdn\.jsdelivr\.net(\s|$)/);
    }
    expect(directive("worker-src")).toBe("worker-src 'self' blob:");
    expect(directive("script-src")).not.toContain("https:");
    expect(AI_ASSETS.mediapipe).toBe(`/vendor/mediapipe-${installed("@mediapipe/tasks-vision")}/`);
    expect(AI_ASSETS.tesseract).toBe(`/vendor/tesseract.js-${installed("tesseract.js")}/`);
    expect(AI_ASSETS.tesseractCore).toBe(`/vendor/tesseract.js-core-${installed("tesseract.js-core")}/`);
    expect(AI_ASSETS.tesseractData).toContain("eng@1.0.0/");
  });
});
