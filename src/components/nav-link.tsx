"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** A header link that marks the current page (aria-current) so the nav shows where you are. */
export function NavLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  const path = usePathname();
  const active = path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} className={`${className} ${active ? "active" : ""}`.trim()} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
