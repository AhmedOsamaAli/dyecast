import { timingSafeEqual } from "node:crypto";
import { purgeOldRateLimits } from "@/lib/auth/rate-limit";
import { purgeAllExpired } from "@/lib/photos/store";
import { sweepStaleTasks } from "@/lib/youcam/service";

export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Daily cleanup, called by Vercel Cron (vercel.json) with the CRON_SECRET: deletes expired stored photos (and keys no
 * longer needed) and any YouCam copies the normal flow left behind.
 */
export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "Not allowed." }, { status: 401 });
  const photos = await purgeAllExpired();
  await purgeOldRateLimits();
  const youcam = await sweepStaleTasks();
  return Response.json({ photosDeleted: photos, youcam }, { headers: { "Cache-Control": "no-store" } });
}
