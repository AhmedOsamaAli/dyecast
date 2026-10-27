import { z } from "zod";

export const PASSWORD_MIN = 10;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: "Enter a valid email address." }));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, { message: `Use at least ${PASSWORD_MIN} characters.` })
  .max(128, { message: "Use at most 128 characters." });

export const signupSchema = z.object({
  displayName: z.string().trim().min(1, { message: "Tell us what to call you." }).max(60),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: "Enter your password." }).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { message: "Enter your current password." }).max(128),
  newPassword: passwordSchema,
});

export type FieldErrors = Partial<Record<string, string[]>>;

/** Flattens Zod issues into { field: [messages] } for forms. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
