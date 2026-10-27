import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { logout } from "@/app/auth-actions";

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="site-header">
      <Link href="/" className="wordmark" aria-label="DyeCast home">dye<span>cast</span><i /></Link>
      <nav aria-label="Main navigation">
        {user ? (
          <>
            <Link href="/check">Check a shade</Link>
            <Link href="/profile">My hair</Link>
            <Link href="/history">Saved</Link>
            <Link href="/settings" className="user-name" title="Settings">{user.displayName}</Link>
            <form action={logout}><button className="text-button">Sign out</button></form>
          </>
        ) : (
          <>
            <Link href="/examples">Examples</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/login">Sign in</Link>
            <Link href="/register" className="button compact">Get started</Link>
          </>
        )}
      </nav>
    </header>
  );
}
