"use client";

import Link from "next/link";
import { Camera, Download, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CompareSlider } from "@/components/ui/compare-slider";
import { ApiError, fetchRender, fetchStoredSelfie, startRender, uploadPhoto, waitForTask, type RenderRequest } from "@/lib/client/api";
import { blobToCanvas } from "@/lib/client/image";
import { getLocal, putLocal, renderKey, SELFIE_KEY, type LocalEntry } from "@/lib/client/local-store";

interface Props {
  checkId: string;
  promiseHex: string;
  rootsHex: string;
  lengthsHex: string;
  twoZone: boolean;
  hasStoredSelfie: boolean;
  /** The box is 3+ levels lighter than the hair today, beyond what a photo try-on can show. */
  muchLighter?: boolean;
  /** Shown next to the photo comparison, e.g. the "save my result card" button. */
  saveButton?: ReactNode;
}

type Engine = "youcam" | "device";
interface Shot {
  url: string;
  type: string;
}
interface Renders {
  promise: Shot;
  reality: Shot;
  engine: Engine;
}

async function deviceRender(photo: Blob, roots: string, lengths: string, rootsShare: number): Promise<Blob> {
  const { segmentHair, hasHair, recolorHair, canvasToBlob } = await import("@/lib/client/hair-vision");
  const canvas = await blobToCanvas(photo);
  const mask = await segmentHair(canvas);
  if (!hasHair(mask)) throw new Error("We couldn't find hair in your photo. Try one where your hair is clearly visible.");
  return canvasToBlob(recolorHair(canvas, mask, { roots, lengths, rootsShare }));
}

const extension = (type: string) => (type.includes("png") ? "png" : "jpg");

export function PhotoPreview({ checkId, promiseHex, rootsHex, lengthsHex, twoZone, hasStoredSelfie, muchLighter = false, saveButton }: Props) {
  const [selfie, setSelfie] = useState<LocalEntry | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [ratio, setRatio] = useState(3 / 4);
  const [loading, setLoading] = useState(true);
  const [renders, setRenders] = useState<Renders | null>(null);
  const [view, setView] = useState<"box" | "today">("box");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const urls = useRef<string[]>([]);

  const track = (blob: Blob): Shot => {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    return { url, type: blob.type };
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let entry = await getLocal(SELFIE_KEY);
      if (!entry && hasStoredSelfie) {
        const blob = await fetchStoredSelfie().catch(() => null);
        if (blob) entry = { blob, savedAt: Date.now() };
      }
      const [promise, reality] = await Promise.all([getLocal(renderKey(checkId, "promise")), getLocal(renderKey(checkId, "reality"))]);
      if (cancelled) return;
      if (entry) {
        setSelfie(entry);
        const shot = track(entry.blob);
        setSelfieUrl(shot.url);
        const img = new Image();
        img.onload = () => !cancelled && img.naturalHeight && setRatio(img.naturalWidth / img.naturalHeight);
        img.src = shot.url;
      }
      if (promise && reality) {
        setRenders({ promise: track(promise.blob), reality: track(reality.blob), engine: promise.engine ?? "device" });
      }
      setLoading(false);
    })();
    const owned = urls.current;
    return () => {
      cancelled = true;
      owned.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [checkId, hasStoredSelfie]);

  async function save(promise: Blob, reality: Blob, engine: Engine) {
    await putLocal(renderKey(checkId, "promise"), { blob: promise, savedAt: Date.now(), engine });
    await putLocal(renderKey(checkId, "reality"), { blob: reality, savedAt: Date.now(), engine });
    setRenders({ promise: track(promise), reality: track(reality), engine });
  }

  async function renderOnDevice() {
    if (!selfie) return;
    setError("");
    setBusy("Recoloring your hair on this device…");
    try {
      const [promise, reality] = await Promise.all([
        deviceRender(selfie.blob, promiseHex, promiseHex, 0.2),
        deviceRender(selfie.blob, twoZone ? rootsHex : lengthsHex, lengthsHex, 0.22),
      ]);
      await save(promise, reality, "device");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The on-device preview failed.");
    } finally {
      setBusy("");
    }
  }

  async function renderWithYouCam() {
    if (!selfie || !consent) return;
    setError("");
    try {
      // Each render gets its own upload: deleting a finished task at YouCam also deletes its input photo.
      setBusy("Uploading your photo securely…");
      const [promiseFile, realityFile] = await Promise.all([uploadPhoto(selfie.blob), uploadPhoto(selfie.blob)]);
      setBusy("YouCam AI is coloring your hair…");
      const promiseReq: RenderRequest = { fileId: promiseFile.fileId, mode: "full", color: promiseHex, intensity: 85, shine: 40 };
      const realityReq: RenderRequest = twoZone
        ? { fileId: realityFile.fileId, mode: "ombre", top: rootsHex, bottom: lengthsHex, intensity: 85, shine: 30, blend: 55, offset: -0.45 }
        : { fileId: realityFile.fileId, mode: "full", color: lengthsHex, intensity: 85, shine: 30 };
      const [p, r] = await Promise.all([startRender(promiseReq), startRender(realityReq)]);
      const [pDone, rDone] = await Promise.all([waitForTask("hair-color", p.taskId), waitForTask("hair-color", r.taskId)]);
      if (pDone.status !== "success" || rDone.status !== "success") throw new ApiError(pDone.error ?? rDone.error ?? "YouCam couldn't color this photo.", "render", 0);
      const [pBlob, rBlob] = await Promise.all([fetchRender(p.taskId), fetchRender(r.taskId)]);
      if (!pBlob || !rBlob) {
        // Demo mode (no API key): fall back to the on-device renderer.
        setBusy("");
        await renderOnDevice();
        return;
      }
      await save(pBlob, rBlob, "youcam");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The YouCam preview failed. Try the on-device preview.");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <section className="panel photo-preview"><p className="muted small">Looking for your photo on this device…</p></section>;

  if (!selfie) {
    return (
      <section className="panel photo-preview empty" id="see-it-on-you">
        <span className="icon-badge" aria-hidden="true"><Camera size={20} /></span>
        <div>
          <p className="eyebrow">SEE IT ON YOU</p>
          <h2>Add a selfie to see this on your own hair</h2>
          <p className="muted small">Your photo stays on this device unless you choose encrypted storage in Settings.</p>
        </div>
        <Link className="button secondary" href="/profile">Add a photo in your profile</Link>
      </section>
    );
  }

  const controls = (
    <div className="render-controls">
      <label className="check-row small">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Send my photo to YouCam (Perfect Corp) for a realistic AI render.</span>
      </label>
      <div className="button-row">
        <button type="button" className="button" disabled={!consent || Boolean(busy)} onClick={renderWithYouCam}>
          <Sparkles size={16} aria-hidden="true" /> {renders ? "Render again with YouCam AI" : "Render with YouCam AI"}
        </button>
        <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={renderOnDevice}>
          <WandSparkles size={16} aria-hidden="true" /> Quick preview on this device
        </button>
      </div>
      {busy && <p className="small muted busy-line" role="status"><span className="spinner" aria-hidden="true" /> {busy}</p>}
      {error && <p role="alert" className="notice danger small">{error}</p>}
    </div>
  );

  if (!renders) {
    return (
      <section className="panel photo-preview" id="see-it-on-you" aria-labelledby="see-it-title">
        <div className="photo-start">
          {selfieUrl && <img src={selfieUrl} alt="Your hair today" className="photo-start-img" />}
          <div className="stack">
            <div>
              <p className="eyebrow">SEE IT ON YOU</p>
              <h2 id="see-it-title">See the box and your likely result on your own photo</h2>
              <p className="muted small">YouCam AI recolors only your hair. The quick preview runs entirely in your browser.</p>
            </div>
            {controls}
          </div>
        </div>
      </section>
    );
  }

  const beforeShot = view === "box" ? renders.promise.url : selfieUrl;
  const thumbs: Array<{ key: string; label: string; shot: Shot | null; url: string | null }> = [
    { key: "today", label: "Today", shot: null, url: selfieUrl },
    { key: "box", label: "Box promise", shot: renders.promise, url: renders.promise.url },
    { key: "likely", label: "Likely on you", shot: renders.reality, url: renders.reality.url },
  ];

  return (
    <section className="panel photo-preview" id="see-it-on-you" aria-labelledby="see-it-title">
      <div className="section-top">
        <div>
          <p className="eyebrow">SEE IT ON YOU</p>
          <h2 id="see-it-title">Drag to compare on your photo</h2>
        </div>
        <div className="segmented" role="group" aria-label="What to compare">
          <button type="button" aria-pressed={view === "box"} onClick={() => setView("box")}>Box vs likely</button>
          <button type="button" aria-pressed={view === "today"} onClick={() => setView("today")}>Today vs likely</button>
        </div>
      </div>
      <div className="photo-compare">
        <CompareSlider
          ratio={ratio}
          before={beforeShot ? <img src={beforeShot} alt="" draggable={false} /> : null}
          after={<img src={renders.reality.url} alt="Your photo with the likely result" draggable={false} />}
          beforeLabel={view === "box" ? "Box promise" : "Today"}
          afterLabel="Likely on you"
        />
        <div className="photo-side">
          <div className="thumbs">
            {thumbs.map((t) => (
              <figure key={t.key} className={t.key === "likely" ? "highlight" : ""}>
                {t.url && <img src={t.url} alt={t.label} />}
                <figcaption>
                  <span>{t.label}</span>
                  {t.shot && (
                    <a className="thumb-save" href={t.shot.url} download={`dyecast-${t.key}.${extension(t.shot.type)}`}>
                      <Download size={14} aria-hidden="true" /> Save
                    </a>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="small muted">
            {renders.engine === "youcam" ? "Rendered with YouCam AI Hair Color; the images were deleted from YouCam after delivery." : "Rendered on this device; the photo never left your browser."} Previews are illustrations, not guarantees.
            {renders.engine === "youcam" && muchLighter && " Photo try-ons keep your hair's natural depth, so a much lighter box looks darker here than on the box — the swatch above shows its true color."}
          </p>
          {saveButton}
          {controls}
        </div>
      </div>
    </section>
  );
}
