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
        <li><strong>Cleaned in your browser.</strong> Before upload, your photo is re-encoded on your device, which strips location (GPS), camera and other hidden metadata, and downsized.</li>
        <li><strong>Measured on your device.</strong> Hair color is measured in your browser with on-device AI. Box photos (for reading shade codes) and inspiration photos never leave your device at all.</li>
        <li><strong>Analyzed by YouCam.</strong> To suggest your hair color class, length and density, and to render try-on previews, a copy is sent over HTTPS to YouCam (Perfect Corp). Only after you tick the consent box.</li>
        <li><strong>Deleted from YouCam right away.</strong> As soon as we receive an analysis or a preview, we ask YouCam to delete that task and its images. YouCam keeps uploaded source files for up to 30 days, then removes them automatically.</li>
        <li><strong>Previews are delivered once.</strong> Rendered images pass through our server to you; their download links never reach your browser and aren&apos;t stored.</li>
      </ul>

      <h2>If you choose to store your selfie</h2>
      <ul>
        <li>Off by default. You can turn it on in <Link href="/settings">Settings</Link> so previews work on any device.</li>
        <li>Encrypted with AES-256-GCM using a key unique to you, which is itself encrypted with a server key that never sits in the database.</li>
        <li>Each photo is cryptographically bound to your account, so it can&apos;t be read as anyone else&apos;s.</li>
        <li>Kept for 30 days, then deleted. Deleting your photos also destroys your key, so any backup copies become unreadable.</li>
        <li>Served only to you, over an authenticated connection, never cached.</li>
      </ul>

      <h2>Your account</h2>
      <ul>
        <li>Passwords are hashed with scrypt; sessions use random tokens stored only as hashes.</li>
        <li>Sign in with Google uses OAuth with PKCE; we receive your name and verified email, nothing else.</li>
        <li>Download everything we store, or delete your account and all its data at any time in <Link href="/settings">Settings</Link>.</li>
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
