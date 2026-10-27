export interface GoogleClaims {
  sub: string;
  email: string;
  name: string;
}

const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const CLOCK_SKEW_SECONDS = 120;

/**
 * Validates ID-token claims received directly from Google's token endpoint over TLS
 * (OpenID Connect Core §3.1.3.7 permits TLS server validation in place of a signature check here).
 * Only accounts whose email Google has verified are accepted.
 */
export function parseGoogleClaims(raw: unknown, clientId: string, nowSeconds = Date.now() / 1000): GoogleClaims | null {
  if (!raw || typeof raw !== "object" || !clientId) return null;
  const c = raw as Record<string, unknown>;
  const audience = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (typeof c.iss !== "string" || !ISSUERS.has(c.iss)) return null;
  if (!audience.includes(clientId)) return null;
  if (typeof c.exp !== "number" || c.exp + CLOCK_SKEW_SECONDS < nowSeconds) return null;
  if (typeof c.sub !== "string" || !c.sub) return null;
  if (typeof c.email !== "string" || !c.email.includes("@")) return null;
  if (c.email_verified !== true && c.email_verified !== "true") return null;
  const email = c.email.trim().toLowerCase();
  const name = (typeof c.name === "string" && c.name.trim()) || email.split("@")[0];
  return { sub: c.sub, email, name: name.slice(0, 60) };
}
