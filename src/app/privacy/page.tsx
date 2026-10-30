import Link from "next/link";

export const metadata = { title: "Privacy & photo security" };

export default function PrivacyPage() {
  return (
    <main className="page-shell prose-page">
      <p className="eyebrow">PRIVACY & PHOTO SECURITY</p>
      <h1>Your face is not our product.</h1>
      <p className="muted">How DyeCast handles your photos and data — in plain words.</p>

      <h2>Photos are optional</h2>
      <p>You can describe your hair by hand and never take a photo. Every forecast uses the choices you confirm, not the raw photo.</p>

      <h2>What happens when you use a photo</h2>
      <ul>
        <li><strong>Camera or upload, your choice.</strong> You can take the photo with your phone&apos;s camera or your computer&apos;s webcam, or upload one. The live camera view never leaves your browser, and the camera turns off as soon as the photo is taken.</li>
        <li><strong>Cleaned in your browser.</strong> Before upload, your photo is re-encoded on your device, which strips location (GPS), camera and other hidden metadata, and downsized.</li>
        <li><strong>Measured on your device.</strong> Hair color is measured in your browser with on-device AI. Box photos (for reading shade codes) and inspiration photos never leave your device at all.</li>
        <li><strong>Analyzed by YouCam.</strong> To suggest your hair color class, length and density, and to render try-on previews, a copy is sent over HTTPS to YouCam (Perfect Corp). Only after you tick the consent box.</li>
        <li><strong>Deletion requests and retries.</strong> After delivering an analysis or a preview, we ask YouCam to delete its task, uploaded photo and outputs. Unconfirmed deletions and interrupted tasks remain queued for a daily retry. This is not a guarantee of instant deletion: YouCam must confirm it. An upload whose task never started cannot be deleted through its File API and falls under YouCam&apos;s automatic retention (up to 30 days).</li>
        <li><strong>Previews are delivered once.</strong> Rendered images pass through our server to you. Their download links never reach your browser and are erased as soon as the preview is delivered (or by the daily cleanup if it never is).</li>
        <li><strong>Kept in this browser, for you only.</strong> A selfie you analyze is kept in this browser for previews, tied to your account, for up to 30 days. Signing out, deleting your account or &quot;Clear photos on this device&quot; in Settings removes it, and another account on the same browser never sees it.</li>
      </ul>

      <h2>If you choose to store your selfie</h2>
      <ul>
        <li>Off by default. You can turn it on in <Link href="/settings">Settings</Link> so previews work on any device.</li>
        <li>Encrypted with AES-256-GCM using a key unique to you, which is itself encrypted with a server key that never sits in the database.</li>
        <li>Each photo is cryptographically bound to your account, so it can&apos;t be read as anyone else&apos;s.</li>
        <li>Kept for 30 days, then deleted by a daily cleanup. Deleting your photos or your account also deletes your key.</li>
        <li>Served only to you, over an authenticated connection, never cached.</li>
      </ul>

      <h2>Your account</h2>
      <ul>
        <li>Passwords are hashed with scrypt; sessions use random tokens stored only as hashes. Repeated sign-in attempts are slowed down, per email and per network.</li>
        <li>Sign in with Google uses OAuth with PKCE; we receive your name and verified email, nothing else.</li>
        <li>Download your account data as JSON (photo metadata, not image files), or delete your account in <Link href="/settings">Settings</Link>. Deletion removes your profile, saved checks, stored photos and key, and queues any outstanding YouCam tasks for deletion. Usage records without your account identifier stay for the daily limits; short-lived abuse-prevention counters are removed by cleanup.</li>
      </ul>

      <h2>What we never do</h2>
      <p>We don&apos;t sell data, run ads, use your photos to train models, or share your hair profile with brands.</p>

      <p className="small muted">
        Third-party processing: <a href="https://www.makeupar.com/perfectbeauty/youcam/privacy-policy-api" target="_blank" rel="noreferrer">YouCam API privacy policy</a>.
        DyeCast is an educational prototype, not medical advice.
      </p>
    </main>
  );
}
