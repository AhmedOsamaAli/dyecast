"use client";

import { ShieldCheck, Sun, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { labToHex } from "@/lib/color";
import { densityFromYouCam, lengthFromYouCam, type DensityClass, type LengthClass } from "@/lib/engine/boxes";
import { levelName } from "@/lib/engine/levels";
import { suggestFromHairClass, suggestFromLab } from "@/lib/engine/measure";
import { todaySwatch } from "@/lib/engine/swatch";
import type { GrayShare, HairTone } from "@/lib/engine/types";
import type { Measurement } from "@/lib/checks/validation";
import { analyzePhoto, ApiError, waitForTask, type TermResults, type ToneResults } from "@/lib/client/api";
import { blobToCanvas, prepareImage } from "@/lib/client/image";
import { hasHair, measureHair, segmentHair } from "@/lib/client/hair-vision";
import { checkPhotoLighting, type LightingAdvice } from "@/lib/client/lighting";
import { putLocal, SELFIE_KEY } from "@/lib/client/local-store";
import { TONE_LABELS } from "@/components/form-controls";
import { HairSwatch } from "@/components/hair-swatch";
import { PhotoSlot } from "@/components/profile/photo-slot";
import { LENGTH_LABELS, DENSITY_LABELS } from "@/lib/engine/boxes";

const GRAY_LABELS: Record<GrayShare, string> = {
  none: "None",
  some: "A little",
  half: "About a quarter to half",
  most: "More than half",
};

export interface PhotoSuggestions {
  level?: number;
  tone?: HairTone;
  length?: LengthClass;
  density?: DensityClass;
  gray?: GrayShare;
  measurement: Measurement;
}

type Status = "idle" | "working" | "done" | "error";

export function PhotoAssist({ mockMode, storePhotos, onApply }: {
  mockMode: boolean;
  storePhotos: boolean;
  onApply: (s: PhotoSuggestions) => void;
}) {
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [densityPhoto, setDensityPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<PhotoSuggestions | null>(null);
  const [lighting, setLighting] = useState<LightingAdvice | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function choose(file: File, kind: "selfie" | "density") {
    setError("");
    try {
      const prepared = await prepareImage(file);
      urls.current.push(prepared.url);
      if (kind === "selfie") {
        setPhoto({ blob: prepared.blob, url: prepared.url });
        setResult(null);
        setStatus("idle");
        setLighting(await checkPhotoLighting(prepared.blob).catch(() => null));
      } else {
        setDensityPhoto({ blob: prepared.blob, url: prepared.url });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't open that photo.");
    }
  }

  async function analyze() {
    if (!photo || !consent) return;
    setStatus("working");
    setError("");
    try {
      setProgress("Finding your hair on this device…");
      const local = (async () => {
        try {
          const canvas = await blobToCanvas(photo.blob);
          const mask = await segmentHair(canvas);
          if (!hasHair(mask)) return null;
          return measureHair(canvas, mask);
        } catch {
          return null;
        }
      })();

      setProgress("Analyzing with YouCam AI…");
      const started = await analyzePhoto(photo.blob, densityPhoto?.blob);
      await putLocal(SELFIE_KEY, { blob: photo.blob, savedAt: Date.now() });
      const [tone, length, density, measured] = await Promise.all([
        waitForTask<ToneResults>("skin-tone-analysis", started.tasks.tone),
        waitForTask<TermResults>("hair-length-detection", started.tasks.length),
        started.tasks.density ? waitForTask<TermResults>("hair-density-detection", started.tasks.density) : Promise.resolve(null),
        local,
      ]);

      const hairClass = tone.status === "success" ? tone.results?.hairColorName : undefined;
      const level = measured ? suggestFromLab(measured.lab, hairClass, measured) : hairClass ? suggestFromHairClass(hairClass) : null;
      const suggestions: PhotoSuggestions = {
        level: level?.level,
        tone: level?.tone,
        gray: level?.suggestGray,
        length: length.status === "success" ? lengthFromYouCam(length.results?.term) : undefined,
        density: density?.status === "success" ? densityFromYouCam(density.results?.term) : undefined,
        measurement: {
          measuredHex: measured ? labToHex(measured.lab) : undefined,
          youcamHairHex: tone.results?.hairColor,
          youcamHairClass: hairClass,
          skinHex: tone.results?.skinColor,
          lengthTerm: length.results?.term,
          densityTerm: density?.results?.term,
          suggestedLevel: level?.level,
          mock: started.mock,
          analyzedAt: new Date().toISOString(),
        },
      };
      if (tone.status === "error") setError(`YouCam couldn't read the color tones: ${tone.error ?? "try a brighter, front-facing photo"}.`);
      setResult(suggestions);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError(e instanceof ApiError || e instanceof Error ? e.message : "The analysis failed. You can still choose everything by hand.");
    } finally {
      setProgress("");
    }
  }

  return (
    <section className="panel photo-assist" aria-labelledby="photo-assist-title">
      <p className="eyebrow">OPTIONAL · FASTER</p>
      <h2 id="photo-assist-title">Let a photo suggest</h2>
      <p className="muted small">
        Take a selfie here or upload one. It can suggest your level, tone, length and density. You confirm everything — your choices, not the photo, drive the forecast.
      </p>
      {mockMode && <p className="notice small">Demo mode: YouCam responses are simulated because no API key is configured.</p>}

      <div className="photo-private">
        <ShieldCheck size={20} aria-hidden="true" />
        <p>
          <strong>Your photo stays on this device.</strong> Taking or choosing a photo uploads nothing, and your hair color is
          measured right here. Only when you tap <em>Analyze</em> does a cleaned copy (no location or camera data) go to YouCam,
          which deletes it right after. {storePhotos ? "Your settings also keep an encrypted copy for 30 days." : "We don't keep it on our servers."}
        </p>
      </div>

      <div className="photo-inputs">
        <PhotoSlot
          label="Selfie"
          hint="face the camera, hair down, daylight"
          preview={photo?.url}
          previewAlt="Your selfie preview"
          onPhoto={(file) => choose(file, "selfie")}
          cameraTitle="Take a selfie"
          cameraTip="Face a window in daylight, with your hair down and loose. No filters or beauty mode, so the color stays true."
        />
        <PhotoSlot
          className="small-tile"
          label="Hairline (optional)"
          hint="head tilted down 45°"
          preview={densityPhoto?.url}
          previewAlt="Hairline photo preview"
          onPhoto={(file) => choose(file, "density")}
          cameraTitle="Take a hairline photo"
          cameraTip="Face the camera in daylight, then lower your head about 45° so your whole hairline shows, hair loose. The photo is taken 3 seconds after you press the button."
          countdown={3}
        />
      </div>

      {lighting && (
        <p className={`lighting-check ${lighting.ok ? "good" : "warn"}`} role="status">
          {lighting.ok ? <Sun size={16} aria-hidden="true" /> : <TriangleAlert size={16} aria-hidden="true" />}
          <span>{lighting.ok ? "Good light for true color." : lighting.issues[0].text}</span>
        </p>
      )}

      <label className="check-row">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Send a cleaned copy to YouCam (by Perfect Corp) to analyze my hair. It&apos;s deleted right after.</span>
      </label>

      <button type="button" className="button full" disabled={!consent || !photo || status === "working"} onClick={analyze}>
        {status === "working" ? progress || "Analyzing…" : "Analyze my photo"}
      </button>
      {error && <p role="alert" className="notice danger small">{error}</p>}

      {result && (
        <div className="suggestions" aria-live="polite">
          <h3>What the photo suggests</h3>
          {result.level !== undefined && (
            <div className="suggestion-hero">
              <HairSwatch
                className="suggest-swatch"
                {...todaySwatch({
                  lengthsLevel: result.level,
                  naturalLevel: result.level,
                  currentTone: result.tone ?? "neutral",
                  naturalTone: result.tone ?? "neutral",
                  history: "virgin",
                  gray: result.gray ?? "none",
                })}
                label={`Suggested hair color: level ${result.level}, ${levelName(result.level)}`}
                seed={3}
              />
              <div>
                <strong>Level {result.level} · {levelName(result.level)}</strong>
                <span>{TONE_LABELS[result.tone ?? "neutral"]}{result.gray ? ` · gray: ${GRAY_LABELS[result.gray].toLowerCase()}` : ""}</span>
                <small className="muted">Shown on real hair, as it looks in daylight.</small>
              </div>
            </div>
          )}
          <dl>
            {result.length && <div><dt>Length</dt><dd>{LENGTH_LABELS[result.length]}</dd></div>}
            {result.density && <div><dt>Density</dt><dd>{DENSITY_LABELS[result.density]}</dd></div>}
            {result.measurement.youcamHairClass && <div><dt>YouCam hair color</dt><dd>{result.measurement.youcamHairClass}</dd></div>}
          </dl>
          {(result.measurement.measuredHex || result.measurement.youcamHairHex) && (
            <details className="camera-saw">
              <summary>What the camera saw</summary>
              <div className="measure-chips">
                {result.measurement.measuredHex && <span><i style={{ background: result.measurement.measuredHex }} /> Measured on this device</span>}
                {result.measurement.youcamHairHex && <span><i style={{ background: result.measurement.youcamHairHex }} /> YouCam&apos;s reading</span>}
              </div>
              <p className="small muted">Photos make hair look darker and duller than it does in daylight, so the suggestion corrects for the camera instead of copying these colors.</p>
            </details>
          )}
          <button type="button" className="button secondary full" onClick={() => onApply(result)}>Use these suggestions</button>
          <p className="small muted">Then check each choice against your hair in daylight.</p>
        </div>
      )}
    </section>
  );
}
