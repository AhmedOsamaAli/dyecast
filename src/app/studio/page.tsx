import { redirect } from "next/navigation";

/** The old studio page now lives at /check (kept so earlier links keep working). */
export default function StudioPage() {
  redirect("/check");
}
