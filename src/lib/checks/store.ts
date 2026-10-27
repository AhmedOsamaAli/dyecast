import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { hairProfiles, savedChecks } from "@/lib/db/schema";
import { hairProfileSchema, type HairProfileData, type StudioInput } from "./validation";
import type { CheckReport } from "./report";

export async function getProfile(userId: string): Promise<{ profile: HairProfileData; updatedAt: Date } | null> {
  const [row] = await db.select().from(hairProfiles).where(eq(hairProfiles.userId, userId)).limit(1);
  if (!row) return null;
  const parsed = hairProfileSchema.safeParse(row.profile);
  return parsed.success ? { profile: parsed.data, updatedAt: row.updatedAt } : null;
}

export async function saveProfileFor(userId: string, profile: HairProfileData): Promise<void> {
  const now = new Date();
  await db
    .insert(hairProfiles)
    .values({ userId, profile, updatedAt: now })
    .onConflictDoUpdate({ target: hairProfiles.userId, set: { profile, updatedAt: now } });
}

export async function insertCheck(userId: string, input: StudioInput, report: CheckReport): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(savedChecks).values({ id, userId, input, report, createdAt: new Date() });
  return id;
}

export async function getCheck(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(savedChecks)
    .where(and(eq(savedChecks.id, id), eq(savedChecks.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listChecks(userId: string, limit = 50) {
  return db.select().from(savedChecks).where(eq(savedChecks.userId, userId)).orderBy(desc(savedChecks.createdAt)).limit(limit);
}

export async function removeCheck(userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(savedChecks)
    .where(and(eq(savedChecks.id, id), eq(savedChecks.userId, userId)))
    .returning({ id: savedChecks.id });
  return deleted.length > 0;
}
