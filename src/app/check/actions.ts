"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { fieldErrors, type FieldErrors } from "@/lib/auth/validation";
import { rateLimit } from "@/lib/auth/rate-limit";
import { buildReport } from "@/lib/checks/report";
import { getProfile, insertCheck, removeCheck } from "@/lib/checks/store";
import { checkTargetSchema, studioSchema } from "@/lib/checks/validation";
import type { ProductType, ToneSystemId } from "@/lib/engine/types";
import { extractProductInfo, productTypeHint, shadeCandidatesFrom, slugText } from "@/lib/product-link/extract";
import { checkPublicUrl } from "@/lib/product-link/address";
import { fetchProductPage } from "@/lib/product-link/fetch-page";

export interface CheckState {
  error?: string;
  fields?: FieldErrors;
}

/** Runs a reality check for the signed-in user's saved hair profile and stores an immutable snapshot. */
export async function createCheck(_previous: CheckState, form: FormData): Promise<CheckState> {
  const user = await requireUser();
  const saved = await getProfile(user.id);
  if (!saved) return { error: "Create your hair profile first." };
  const target = checkTargetSchema.safeParse(Object.fromEntries(form));
  if (!target.success) return { error: "Please check the shade details.", fields: fieldErrors(target.error) };
  const limit = await rateLimit(`check:${user.id}`, 60, 60 * 1000);
  if (!limit.ok) return { error: `Please wait ${limit.retryAfterSeconds} seconds before checking again.` };

  const input = studioSchema.parse({ ...saved.profile, ...target.data });
  const result = buildReport(input);
  if (!result.ok) return { error: result.error, fields: { shadeCode: [result.error] } };
  const id = await insertCheck(user.id, input, result.report);
  revalidatePath("/history");
  redirect(`/checks/${id}`);
}

export async function deleteCheck(id: string): Promise<void> {
  const user = await requireUser();
  if (!(await removeCheck(user.id, id))) notFound();
  revalidatePath("/history");
  redirect("/history");
}

export interface LinkCandidate {
  code: string;
  name: string;
  system: ToneSystemId;
  token: string;
}

export type LinkLookup =
  | { ok: true; title?: string; brand?: string; candidates: LinkCandidate[]; productHint?: ProductType; readPage: boolean; note?: string }
  | { ok: false; error: string };

/** Reads a product page (server-side, SSRF-guarded) and finds the shade code in it. */
export async function lookupProductLink(link: string): Promise<LinkLookup> {
  const user = await requireUser();
  const url = checkPublicUrl(String(link ?? ""));
  if (!url.ok) return { ok: false, error: url.error };
  const limit = await rateLimit(`link:${user.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "Too many links. Try again later or type the code." };

  const page = await fetchProductPage(url.url.toString());
  const info = page.ok
    ? extractProductInfo(page.html, page.finalUrl)
    : { title: undefined, brand: undefined, color: undefined, sources: [slugText(url.url.toString())].filter((s): s is string => Boolean(s)) };
  const candidates = shadeCandidatesFrom(info).map((c) => ({
    code: c.shade.code,
    name: c.shade.name,
    system: c.shade.system,
    token: c.token,
  }));
  return {
    ok: true,
    title: info.title,
    brand: info.brand,
    candidates,
    productHint: productTypeHint(info.sources),
    readPage: page.ok,
    note: page.ok ? undefined : page.error,
  };
}
