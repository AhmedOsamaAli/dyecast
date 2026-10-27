"use client";

import { useActionState, useState } from "react";
import {
  changePassword,
  deleteAccount,
  forgetPhotos,
  signOutEverywhere,
  updateAccount,
  type SettingsState,
} from "@/app/settings/actions";
import { clearLocal } from "@/lib/client/local-store";

export function AccountForm({ displayName, storePhotos, storageAvailable }: {
  displayName: string;
  storePhotos: boolean;
  storageAvailable: boolean;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateAccount, {});
  return (
    <form action={action} className="stack">
      <div className="field">
        <label htmlFor="displayName">Your name</label>
        <input id="displayName" name="displayName" defaultValue={displayName} maxLength={60} required
          aria-invalid={Boolean(state.fields?.displayName)} />
        {state.fields?.displayName && <small className="field-error">{state.fields.displayName.join(" ")}</small>}
      </div>
      <label className="check-row">
        <input type="checkbox" name="storePhotos" defaultChecked={storePhotos} disabled={!storageAvailable} />
        <span>
          <strong>Keep my selfie in my account, encrypted (30 days)</strong>
          <small className="muted">
            {storageAvailable
              ? "Lets you see previews on any device. Encrypted with a key unique to you; turning this off deletes it and destroys the key."
              : "Encrypted photo storage isn't configured on this server, so photos are never kept."}
          </small>
        </span>
      </label>
      {state.error && <p role="alert" className="notice danger small">{state.error}</p>}
      {state.message && <p role="status" className="notice success small">{state.message}</p>}
      <button className="button" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
    </form>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(changePassword, {});
  return (
    <form action={action} className="stack">
      {hasPassword && (
        <div className="field">
          <label htmlFor="currentPassword">Current password</label>
          <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128}
            aria-invalid={Boolean(state.fields?.currentPassword)} />
          {state.fields?.currentPassword && <small className="field-error">{state.fields.currentPassword.join(" ")}</small>}
        </div>
      )}
      <div className="field">
        <label htmlFor="newPassword">{hasPassword ? "New password" : "Set a password (optional)"}</label>
        <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128}
          aria-invalid={Boolean(state.fields?.newPassword)} />
        {state.fields?.newPassword && <small className="field-error">{state.fields.newPassword.join(" ")}</small>}
      </div>
      {state.error && <p role="alert" className="notice danger small">{state.error}</p>}
      <button className="button secondary" disabled={pending}>{pending ? "Saving…" : hasPassword ? "Change password" : "Set password"}</button>
      <p className="small muted">Changing your password signs you out everywhere.</p>
    </form>
  );
}

export function PrivacyActions({ hasStoredPhoto }: { hasStoredPhoto: boolean }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(task: () => Promise<string>) {
    setBusy(true);
    try {
      setMessage(await task());
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <div className="button-row">
        <button type="button" className="button secondary" disabled={busy}
          onClick={() => run(async () => { await clearLocal(); return "Photos and previews on this device were cleared."; })}>
          Clear photos on this device
        </button>
        <button type="button" className="button secondary" disabled={busy || !hasStoredPhoto}
          onClick={() => run(async () => (await forgetPhotos()).message ?? "Deleted.")}>
          Delete photos in my account
        </button>
        <a className="button secondary" href="/api/account/export">Download my data (JSON)</a>
      </div>
      {message && <p role="status" className="notice success small">{message}</p>}
    </div>
  );
}

export function DangerZone() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(deleteAccount, {});
  return (
    <div className="stack">
      <form action={signOutEverywhere}>
        <button className="button secondary">Sign out on every device</button>
      </form>
      <form action={action} className="stack">
        <div className="field">
          <label htmlFor="confirm">Delete my account — type DELETE to confirm</label>
          <input id="confirm" name="confirm" autoComplete="off" aria-invalid={Boolean(state.fields?.confirm)} />
          {state.fields?.confirm && <small className="field-error">{state.fields.confirm.join(" ")}</small>}
        </div>
        <button className="button danger-button" disabled={pending}>{pending ? "Deleting…" : "Delete account and all data"}</button>
      </form>
    </div>
  );
}
