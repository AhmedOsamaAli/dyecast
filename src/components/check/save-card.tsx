"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { getLocal, renderKey, SELFIE_KEY } from "@/lib/client/local-store";
import { composeCard, saveOrShare, type CardPanel, type CardSpec } from "@/lib/client/share-card";
import type { SwatchInput } from "@/lib/hair/texture";

interface SaveCardProps {
  checkId: string;
  spec: Omit<CardSpec, "panels">;
  /** Today, the box promise and the likely result, in that order. */
  panels: Array<{ label: string; caption: string; swatch: SwatchInput; highlight?: boolean }>;
  fileName: string;
  className?: string;
}

/**
 * Creates the shareable result card on this device. Uses the photo previews when this device has them
 * (selfie + both renders), otherwise the hair swatches. Nothing is uploaded.
 */
export function SaveCardButton({ checkId, spec, panels, fileName, className = "button" }: SaveCardProps) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setStatus("");
    const urls: string[] = [];
    try {
      const [selfie, promise, reality] = await Promise.all([
        getLocal(SELFIE_KEY),
        getLocal(renderKey(checkId, "promise")),
        getLocal(renderKey(checkId, "reality")),
      ]);
      const photos = selfie && promise && reality ? [selfie.blob, promise.blob, reality.blob] : null;
      const cardPanels: CardPanel[] = panels.map((panel, i) => {
        if (!photos) return { ...panel, visual: { kind: "swatch", swatch: panel.swatch } };
        const url = URL.createObjectURL(photos[i]);
        urls.push(url);
        return { ...panel, visual: { kind: "image", src: url } };
      });
      const blob = await composeCard({ ...spec, panels: cardPanels });
      const result = await saveOrShare(blob, fileName, spec.title);
      setStatus(result === "downloaded" ? "Saved to your downloads." : result === "shared" ? "Ready to share." : "");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The card couldn't be created.");
    } finally {
      urls.forEach((url) => URL.revokeObjectURL(url));
      setBusy(false);
    }
  }

  return (
    <div className="save-card">
      <button type="button" className={className} onClick={save} disabled={busy}>
        <Download size={16} aria-hidden="true" /> {busy ? "Creating your card…" : "Save my result card"}
      </button>
      {status && <span role="status" className="small muted">{status}</span>}
    </div>
  );
}
