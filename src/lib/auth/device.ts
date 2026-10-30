import { createHash } from "node:crypto";

/**
 * A stable, non-reversible tag for one account. The page carries it so photos saved in this browser stay with the
 * account that saved them (see src/lib/client/local-store.ts).
 */
export function deviceOwnerTag(userId: string): string {
  return createHash("sha256").update(`dyecast-device:${userId}`).digest("base64url").slice(0, 22);
}
