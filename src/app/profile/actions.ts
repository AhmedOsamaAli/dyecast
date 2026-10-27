"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { fieldErrors, type FieldErrors } from "@/lib/auth/validation";
import { rateLimit } from "@/lib/auth/rate-limit";
import { saveProfileFor } from "@/lib/checks/store";
import { hairProfileSchema } from "@/lib/checks/validation";

export interface ProfileState {
  error?: string;
  fields?: FieldErrors;
}

export async function saveProfile(_previous: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = hairProfileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Please check your hair details.", fields: fieldErrors(parsed.error) };
  const limit = await rateLimit(`profile:${user.id}`, 60, 60 * 1000);
  if (!limit.ok) return { error: `Please wait ${limit.retryAfterSeconds} seconds before saving again.` };
  await saveProfileFor(user.id, parsed.data);
  revalidatePath("/check");
  redirect("/check?profile=saved");
}
