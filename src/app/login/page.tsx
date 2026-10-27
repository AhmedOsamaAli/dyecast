import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { googleConfigured } from "@/lib/auth/google";
import { AuthForm } from "@/components/auth-form";
import { GoogleButton } from "@/components/google-button";
import { Notice } from "@/components/notice";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/check");
  const params = await searchParams;
  return (
    <main className="auth-page">
      <section className="panel auth-panel">
        <p className="eyebrow">WELCOME BACK</p>
        <h1>Your next color starts here.</h1>
        <p className="muted">Sign in to your hair profile and saved reality checks.</p>
        <div className="stack">
          <Notice code={params.error ?? params.notice} />
          <GoogleButton enabled={googleConfigured()} />
          <AuthForm mode="login" />
        </div>
      </section>
    </main>
  );
}
