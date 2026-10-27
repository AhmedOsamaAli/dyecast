import { describe, expect, it } from "vitest";
import { generateToken, hashPassword, sha256, verifyPassword } from "../crypto";
import { fieldErrors, loginSchema, signupSchema } from "../validation";

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("correct horse battery!", stored)).toBe(false);
  });

  it("salts every hash and rejects malformed input", async () => {
    const [a, b] = await Promise.all([hashPassword("same password"), hashPassword("same password")]);
    expect(a).not.toBe(b);
    expect(await verifyPassword("x", "md5$abc")).toBe(false);
  });
});

describe("tokens", () => {
  it("are long, random and hashed deterministically", () => {
    const t = generateToken();
    expect(t.length).toBeGreaterThanOrEqual(43);
    expect(generateToken()).not.toBe(t);
    expect(sha256(t)).toBe(sha256(t));
    expect(sha256(t)).toHaveLength(64);
  });
});

describe("validation", () => {
  it("normalizes email and enforces password length", () => {
    const ok = signupSchema.safeParse({ displayName: " Sara ", email: " Sara@Example.COM ", password: "longenough1" });
    expect(ok.success && ok.data).toEqual({ displayName: "Sara", email: "sara@example.com", password: "longenough1" });
    const bad = signupSchema.safeParse({ displayName: "", email: "nope", password: "short" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(Object.keys(fieldErrors(bad.error)).sort()).toEqual(["displayName", "email", "password"]);
  });

  it("requires both login fields", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});
