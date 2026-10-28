"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/crypto";
import { rateLimit } from "@/lib/auth/rate-limit";
import { destroyAllSessions, destroyCurrentSession, requireUser } from "@/lib/auth/session";
import { fieldErrors, passwordSchema, type FieldErrors } from "@/lib/auth/validation";
import { deleteAllPhotos, photoStorageAvailable } from "@/lib/photos/store";
import { forgetUserRenders } from "@/lib/youcam/service";

export interface SettingsState {
  error?: string;
  message?: string;
  fields?: FieldErrors;
}

const profileSchema = z.object({
  displayName: z.string().trim().min(1, { message: "Tell us what to call you." }).max(60),
  storePhotos: z.enum(["on", "off"]).default("off"),
});

export async function updateAccount(_previous: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    displayName: form.get("displayName"),
    storePhotos: form.get("storePhotos") === "on" ? "on" : "off",
  });
  if (!parsed.success) return { error: "Please check the highlighted fields.", fields: fieldErrors(parsed.error) };
  const storePhotos = parsed.data.storePhotos === "on" && photoStorageAvailable();
  await db.update(users).set({ displayName: parsed.data.displayName, storePhotos, updatedAt: new Date() }).where(eq(users.id, user.id));
  if (!storePhotos) await deleteAllPhotos(user.id);
  revalidatePath("/", "layout");
  return { message: storePhotos ? "Saved. Your next photo will be stored encrypted for 30 days." : "Saved. No photos are kept in your account." };
}

export async function forgetPhotos(): Promise<SettingsState> {
  const user = await requireUser();
  await deleteAllPhotos(user.id);
  revalidatePath("/settings");
  return { message: "All stored photos were deleted and your photo key was destroyed." };
}

const passwordChangeSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: passwordSchema,
});

export async function changePassword(_previous: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = passwordChangeSchema.safeParse({
    currentPassword: form.get("currentPassword") || undefined,
    newPassword: form.get("newPassword"),
  });
  if (!parsed.success) return { error: "Please check the highlighted fields.", fields: fieldErrors(parsed.error) };
  const limit = await rateLimit(`password:${user.id}`, 5, 15 * 60 * 1000);
  if (!limit.ok) return { error: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.` };
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
  if (row?.passwordHash) {
    if (!parsed.data.currentPassword || !(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
      return { error: "Your current password is incorrect.", fields: { currentPassword: ["Incorrect password."] } };
    }
  }
  await db.update(users).set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: new Date() }).where(eq(users.id, user.id));
  await destroyAllSessions(user.id);
  redirect("/login?notice=password_changed");
}

export async function signOutEverywhere(): Promise<void> {
  const user = await requireUser();
  await destroyAllSessions(user.id);
  await destroyCurrentSession();
  redirect("/login?notice=signed_out_everywhere");
}

export async function deleteAccount(_previous: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser();
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE to confirm.", fields: { confirm: ["Type DELETE to confirm."] } };
  }
  await deleteAllPhotos(user.id);
  await forgetUserRenders(user.id);
  await db.delete(users).where(eq(users.id, user.id));
  await destroyCurrentSession();
  redirect("/?notice=account_deleted");
}
