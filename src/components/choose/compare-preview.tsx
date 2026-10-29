"use client";

import Link from "next/link";
import { WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ColorPick } from "@/lib/engine/recommend";
import { blobToCanvas } from "@/lib/client/image";
import { getLocal, SELFIE_KEY } from "@/lib/client/local-store";

interface Preview {
  id: string;
  name: string;
  url: string;
}

/** The top picks side by side on the person's saved selfie, recolored on this device: free, and nothing is uploaded. */
export function ComparePreview({ picks }: { picks: ColorPick[] }) {
  const [selfie, setSelfie] = useState<Blob | null | undefined>(undefined);
  const [shown, setShown] = useState<{ key: string; today: string; items: Preview[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const urls = useRef<string[]>([]);

  useEffect(() => {
    let alive = true;
    getLocal(SELFIE_KEY)
      .then((entry) => alive && setSelfie(entry?.blob ?? null))
      .catch(() => alive && setSelfie(null));
    const created = urls.current;
    return () => {
      alive = false;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const key = picks.map((p) => `${p.goal.id}:${p.likelyHex}`).join("|");
  const fresh = shown?.key === key;

  async function preview() {
    if (!selfie) return;
    setBusy(true);
    setError("");
    try {
      const { segmentHair, hasHair, recolorHair, canvasToBlob } = await import("@/lib/client/hair-vision");
      const canvas = await blobToCanvas(selfie);
      const mask = await segmentHair(canvas);
      if (!hasHair(mask)) throw new Error("We couldn't find hair in your saved selfie. Try another one in My hair.");
      const keep = (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        return url;
      };
      const items: Preview[] = [];
      for (const pick of picks) {
        const blob = await canvasToBlob(recolorHair(canvas, mask, { roots: pick.likelyHex, lengths: pick.likelyHex }));
        items.push({ id: pick.goal.id, name: pick.goal.name, url: keep(blob) });
      }
      setShown({ key, today: shown?.today ?? keep(selfie), items });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The preview didn't work. The swatches above still show each color.");
    } finally {
      setBusy(false);
    }
  }

  if (selfie === undefined) return null;
  if (selfie === null) {
    return (
      <p className="compare-invite">
        <WandSparkles size={16} aria-hidden="true" /> See these colors on your own photo:{" "}
        <Link href="/profile?next=choose">add a selfie in My hair</Link>. It stays on this device.
      </p>
    );
  }
  return (
    <section className="panel compare-photos" aria-labelledby="compare-photos-title">
      <div className="compare-photos-head">
        <div>
          <h3 id="compare-photos-title">See them on you</h3>
          <p className="small muted">A quick preview made on this device from your saved selfie. Nothing is uploaded.</p>
        </div>
        {!fresh && (
          <button type="button" className="button secondary" onClick={preview} disabled={busy}>
            <WandSparkles size={16} aria-hidden="true" /> {busy ? "Making previews…" : shown ? "Update the previews" : "Preview on my photo"}
          </button>
        )}
      </div>
      {fresh && shown && (
        <div className="photo-row">
          <figure>
            <img src={shown.today} alt="Your hair today" />
            <figcaption>Today</figcaption>
          </figure>
          {shown.items.map((p) => (
            <figure key={p.id}>
              <img src={p.url} alt={`Preview: ${p.name}`} />
              <figcaption>{p.name}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {error && <p role="alert" className="notice danger small">{error}</p>}
    </section>
  );
}
