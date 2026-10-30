"use client";

import { LogOut } from "lucide-react";
import { logout } from "@/app/auth-actions";
import { clearLocal } from "@/lib/client/local-store";

/** Signs out after removing this browser's photos and previews, so the next person on it can't see them. */
export function SignOutButton() {
  async function signOut() {
    let cleanupFailed = false;
    try {
      await clearLocal();
    } catch {
      console.error("Device photos could not be cleared before sign-out.");
      cleanupFailed = true;
    }
    await logout(cleanupFailed);
  }
  return (
    <form action={signOut}>
      <button className="icon-button" aria-label="Sign out" title="Sign out"><LogOut size={17} aria-hidden="true" /></button>
    </form>
  );
}
