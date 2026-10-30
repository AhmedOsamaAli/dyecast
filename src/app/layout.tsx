import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Geist } from "next/font/google";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

export const metadata: Metadata = {
  title: { default: "DyeCast - Your color, with context", template: "%s | DyeCast" },
  description: "See what a box dye will really do to your hair before it's on your head: the box promise vs. your likely result, with the why and a plan.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Nonces must be generated per request, never baked into static HTML.
  await connection();
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <SiteHeader />
        <div id="main-content">{children}</div>
        <footer className="site-footer">
          <div className="footer-brand">
            <span className="wordmark">dye<span>cast</span><i /></span>
            <p>Know your starting point. Respect your hair.</p>
          </div>
          <nav aria-label="Footer" className="footer-links">
            <Link href="/examples">Examples</Link>
            <Link href="/privacy">Privacy & photos</Link>
            <Link href="/register">Get started</Link>
          </nav>
          <p className="footer-note">
            Powered by YouCam AI. An educational forecast, not a guaranteed result — always follow your box&apos;s instructions,
            allergy alert test and strand test.
          </p>
        </footer>
      </body>
    </html>
  );
}
