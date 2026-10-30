const MESSAGES: Record<string, { tone: "danger" | "success" | "info"; text: string }> = {
  google_unavailable: { tone: "info", text: "Google sign-in isn't configured on this server yet. Use email and password." },
  google_cancelled: { tone: "info", text: "Google sign-in was cancelled." },
  google_state: { tone: "danger", text: "That Google sign-in link expired. Please try again." },
  google_failed: { tone: "danger", text: "Google sign-in failed. Please try again." },
  google_unverified: { tone: "danger", text: "Your Google account email isn't verified, so we couldn't sign you in." },
  google_secured: {
    tone: "success",
    text: "Google is now linked to your account. Because this email was never verified before, we removed the old password and signed out other devices. You can set a new password below.",
  },
  rate_limited: { tone: "danger", text: "Too many sign-in attempts. Please wait a few minutes." },
  password_changed: { tone: "success", text: "Password changed. Sign in again on each device." },
  signed_out_everywhere: { tone: "success", text: "You were signed out on every device." },
  account_deleted: { tone: "success", text: "Your account was deleted, along with your photos, hair profile and saved checks." },
  device_cleanup_failed: { tone: "danger", text: "Signed out, but saved photos could not be cleared. Clear this site's browser data before sharing this device." },
};

/** Shows a friendly message for ?error= or ?notice= codes (unknown codes are ignored, never echoed). */
export function Notice({ code }: { code?: string | string[] }) {
  const key = Array.isArray(code) ? code[0] : code;
  const message = key ? MESSAGES[key] : undefined;
  if (!message) return null;
  return (
    <p role={message.tone === "danger" ? "alert" : "status"} className={`notice ${message.tone === "info" ? "" : message.tone}`}>
      {message.text}
    </p>
  );
}
