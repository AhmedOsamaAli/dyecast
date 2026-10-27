import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DyeCast - Your color, with context", template: "%s | DyeCast" },
  description: "Look beyond the hair dye box. Explore your starting shade, color history and an explainable color forecast.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
    >
      <body>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <SiteHeader />
        <div id="main-content">{children}</div>
        <footer className="site-footer">
          <span className="wordmark">dye<span>cast</span></span>
          <p>Know your starting point. Respect your hair.</p>
          <nav aria-label="Footer" className="footer-links">
            <a href="/examples">Examples</a>
            <a href="/privacy">Privacy & photos</a>
          </nav>
          <span className="small">Powered by YouCam AI · educational forecast, not a guaranteed result</span>
        </footer>
      </body>
    </html>
  );
}
