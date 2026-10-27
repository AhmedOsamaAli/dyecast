import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { googleConfigured } from "@/lib/auth/google";
import { AuthForm } from "@/components/auth-form";
import { GoogleButton } from "@/components/google-button";

export const metadata = { title: "Create your account" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/check");
  return (
    <main className="auth-page">
      <section className="panel auth-panel">
        <p className="eyebrow">A LITTLE LESS GUESSWORK</p>
        <h1>Meet your hair, before the dye.</h1>
        <p className="muted">Create a free account. No selfie or payment details required.</p>
        <div className="stack">
          <GoogleButton enabled={googleConfigured()} />
          <AuthForm mode="register" />
        </div>
      </section>
    </main>
  );
}
