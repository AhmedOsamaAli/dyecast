import Link from "next/link";
import { History, Palette, Settings, Target } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { deviceOwnerTag } from "@/lib/auth/device";
import { DeviceOwner } from "@/components/device-owner";
import { NavLink } from "@/components/nav-link";
import { SignOutButton } from "@/components/sign-out-button";

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="site-header">
      <DeviceOwner owner={user ? deviceOwnerTag(user.id) : ""} />
      <Link href="/" className="wordmark" aria-label="DyeCast home">dye<span>cast</span><i /></Link>
      <nav aria-label="Main navigation">
        {user ? (
          <>
            <NavLink href="/check"><Target size={16} aria-hidden="true" /> <span className="nav-label">Check a shade</span></NavLink>
            <NavLink href="/profile"><Palette size={16} aria-hidden="true" /> <span className="nav-label">My hair</span></NavLink>
            <NavLink href="/history"><History size={16} aria-hidden="true" /> <span className="nav-label">Saved</span></NavLink>
            <NavLink href="/settings" className="user-name"><Settings size={16} aria-hidden="true" /> <span className="nav-label">{user.displayName}<span className="sr-only"> — settings</span></span></NavLink>
            <SignOutButton />
          </>
        ) : (
          <>
            <NavLink href="/examples">Examples</NavLink>
            <NavLink href="/privacy">Privacy</NavLink>
            <NavLink href="/login">Sign in</NavLink>
            <Link href="/register" className="button compact">Get started</Link>
          </>
        )}
      </nav>
    </header>
  );
}
