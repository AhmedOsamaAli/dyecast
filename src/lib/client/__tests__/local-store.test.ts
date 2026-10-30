import { describe, expect, it } from "vitest";
import { isUsable, LOCAL_MAX_AGE_MS } from "../local-store";

describe("photos stored on this device", () => {
  const now = Date.UTC(2026, 9, 29);
  const entry = { owner: "account-a", savedAt: now - 60_000 };

  it("are shown only to the account that saved them", () => {
    expect(isUsable(entry, "account-a", now)).toBe(true);
    expect(isUsable(entry, "account-b", now)).toBe(false);
    // Signed out, or saved before photos were tied to an account.
    expect(isUsable(entry, "", now)).toBe(false);
    expect(isUsable({ savedAt: entry.savedAt }, "account-a", now)).toBe(false);
  });

  it("expire after 30 days", () => {
    expect(isUsable({ ...entry, savedAt: now - LOCAL_MAX_AGE_MS + 1000 }, "account-a", now)).toBe(true);
    expect(isUsable({ ...entry, savedAt: now - LOCAL_MAX_AGE_MS }, "account-a", now)).toBe(false);
    expect(isUsable({ ...entry, savedAt: now + 1000 }, "account-a", now)).toBe(false);
    expect(isUsable({ ...entry, savedAt: NaN }, "account-a", now)).toBe(false);
  });
});
