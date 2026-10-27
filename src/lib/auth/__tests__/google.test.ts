import { describe, expect, it } from "vitest";
import { parseGoogleClaims } from "../google-claims";

const now = 1_800_000_000;
const valid = {
  iss: "https://accounts.google.com",
  aud: "client-123",
  exp: now + 3600,
  sub: "1092837465",
  email: " Lina@Example.com ",
  email_verified: true,
  name: "Lina",
};

describe("Google ID token claims", () => {
  it("accepts a fresh token for our client with a verified email", () => {
    expect(parseGoogleClaims(valid, "client-123", now)).toEqual({ sub: "1092837465", email: "lina@example.com", name: "Lina" });
    expect(parseGoogleClaims({ ...valid, aud: ["other", "client-123"], email_verified: "true" }, "client-123", now)).not.toBeNull();
  });

  it.each([
    ["wrong issuer", { iss: "https://evil.example" }],
    ["wrong audience", { aud: "someone-else" }],
    ["expired", { exp: now - 3600 }],
    ["unverified email", { email_verified: false }],
    ["missing subject", { sub: "" }],
    ["bad email", { email: "nope" }],
  ])("rejects %s", (_label, override) => {
    expect(parseGoogleClaims({ ...valid, ...override }, "client-123", now)).toBeNull();
  });

  it("falls back to the email name and rejects non-objects", () => {
    expect(parseGoogleClaims({ ...valid, name: undefined }, "client-123", now)?.name).toBe("lina");
    expect(parseGoogleClaims(null, "client-123", now)).toBeNull();
    expect(parseGoogleClaims(valid, "", now)).toBeNull();
  });
});
