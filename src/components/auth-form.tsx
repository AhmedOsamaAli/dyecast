"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, register, type AuthState } from "@/app/auth-actions";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const signup = mode === "register";
  const [state, action, pending] = useActionState<AuthState, FormData>(signup ? register : login, {});
  const fields = [
    ...(signup ? [{ name: "displayName", label: "Your name", type: "text", autoComplete: "name", maxLength: 60 }] : []),
    { name: "email", label: "Email address", type: "email", autoComplete: "email", maxLength: 254 },
    { name: "password", label: "Password", type: "password", autoComplete: signup ? "new-password" : "current-password", maxLength: 128 },
  ];
  return (
    <form action={action} className="stack">
      {fields.map((field) => (
        <div className="field" key={field.name}>
          <label htmlFor={field.name}>{field.label}</label>
          <input {...field} id={field.name} required
            minLength={field.name === "password" && signup ? 10 : undefined}
            aria-invalid={Boolean(state.fields?.[field.name])}
            aria-describedby={state.fields?.[field.name] ? `${field.name}-error` : undefined} />
          {state.fields?.[field.name] && <small className="field-error" id={`${field.name}-error`}>{state.fields[field.name]?.join(" ")}</small>}
        </div>
      ))}
      {signup && <p className="muted small">Use at least 10 characters. Your profile and saved checks are private to your account.</p>}
      {state.error && <p role="alert" className="notice danger">{state.error}</p>}
      <button className="button" disabled={pending}>{pending ? "Please wait..." : signup ? "Create your account" : "Sign in"}</button>
      <p className="small muted">
        {signup ? "Already have an account? " : "New to DyeCast? "}
        <Link href={signup ? "/login" : "/register"}>{signup ? "Sign in" : "Create an account"}</Link>
      </p>
    </form>
  );
}
