import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getCheck } from "@/lib/checks/store";
import { selfieInfo } from "@/lib/photos/store";
import { ResultView } from "@/components/check/result-view";
import { deleteCheck } from "@/app/check/actions";

export const metadata = { title: "Your reality check" };

export default async function CheckPage({ params }: PageProps<"/checks/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const check = await getCheck(user.id, id);
  if (!check) notFound();
  const stored = await selfieInfo(user.id);
  return (
    <main className="page-shell">
      <div className="page-toolbar">
        <Link href="/check">← Check another shade</Link>
        <span className="small muted">Private · saved {check.createdAt.toISOString().slice(0, 10)}</span>
      </div>
      <ResultView id={check.id} input={check.input} report={check.report} hasStoredSelfie={Boolean(stored)} />
      <div className="page-toolbar">
        <Link href="/check" className="button">Check another shade</Link>
        <form action={deleteCheck.bind(null, check.id)}>
          <button className="text-button delete-button">Delete this saved check</button>
        </form>
      </div>
    </main>
  );
}
