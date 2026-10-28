"use client";

import { useEffect, useRef, useState } from "react";
import { labToHex } from "@/lib/color";
import { densityFromYouCam, lengthFromYouCam, type DensityClass, type LengthClass } from "@/lib/engine/boxes";
import { levelName } from "@/lib/engine/levels";
import { suggestFromHairClass, suggestFromLab } from "@/lib/engine/measure";
import type { GrayShare, HairTone } from "@/lib/engine/types";
import type { Measurement } from "@/lib/checks/validation";
import { analyzePhoto, ApiError, waitForTask, type TermResults, type ToneResults } from "@/lib/client/api";
import { blobToCanvas, prepareImage } from "@/lib/client/image";
import { hasHair, measureHair, segmentHair } from "@/lib/client/hair-vision";
import { putLocal, SELFIE_KEY } from "@/lib/client/local-store";
import { TONE_LABELS } from "@/components/form-controls";
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
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function choose(file: File | undefined, kind: "selfie" | "density") {
    if (!file) return;
    setError("");
    try {
      const prepared = await prepareImage(file);
      urls.current.push(prepared.url);
      if (kind === "selfie") {
        setPhoto({ blob: prepared.blob, url: prepared.url });
        setResult(null);
        setStatus("idle");
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
      const level = measured ? suggestFromLab(measured, hairClass) : hairClass ? suggestFromHairClass(hairClass) : null;
      const suggestions: PhotoSuggestions = {
        level: level?.level,
        tone: level?.tone,
        gray: level?.suggestGray,
        length: length.status === "success" ? lengthFromYouCam(length.results?.term) : undefined,
        density: density?.status === "success" ? densityFromYouCam(density.results?.term) : undefined,
        measurement: {
          measuredHex: measured ? labToHex(measured) : undefined,
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
        A selfie can suggest your level, tone, length and density. You confirm everything — your choices, not the photo, drive the forecast.
      </p>
      {mockMode && <p className="notice small">Demo mode: YouCam responses are simulated because no API key is configured.</p>}

      <ul className="privacy-points small">
        <li>Location and camera details (EXIF) are removed in your browser before upload.</li>
        <li>Your hair color is also measured on this device; the photo stays here.</li>
        <li>YouCam analyzes a copy, then we delete the results from YouCam right away.</li>
        <li>{storePhotos ? "Your settings keep an encrypted copy for 30 days." : "We don't keep your photo. Turn on encrypted storage in Settings if you want to."}</li>
      </ul>

      <label className="check-row">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>I agree to my photo being processed to analyze my hair (YouCam by Perfect Corp).</span>
      </label>

      <div className="photo-inputs">
        <label className={`upload-tile ${consent ? "" : "disabled"}`}>
          {photo ? <img src={photo.url} alt="Your selfie preview" /> : <span>Selfie<br /><small>face the camera, hair down, daylight</small></span>}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="user" disabled={!consent}
            onChange={(e) => choose(e.target.files?.[0], "selfie")} />
        </label>
        <label className={`upload-tile small-tile ${consent ? "" : "disabled"}`}>
          {densityPhoto ? <img src={densityPhoto.url} alt="Hairline photo preview" /> : <span>Hairline (optional)<br /><small>head tilted down 45°</small></span>}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" disabled={!consent}
            onChange={(e) => choose(e.target.files?.[0], "density")} />
        </label>
      </div>

      <button type="button" className="button full" disabled={!consent || !photo || status === "working"} onClick={analyze}>
        {status === "working" ? progress || "Analyzing…" : "Analyze my photo"}
      </button>
      {error && <p role="alert" className="notice danger small">{error}</p>}

      {result && (
        <div className="suggestions" aria-live="polite">
          <h3>What the photo suggests</h3>
          <dl>
            {result.level !== undefined && (
              <div><dt>Level</dt><dd>{result.level} · {levelName(result.level)}</dd></div>
            )}
            {result.tone && <div><dt>Tone</dt><dd>{TONE_LABELS[result.tone]}</dd></div>}
            {result.length && <div><dt>Length</dt><dd>{LENGTH_LABELS[result.length]}</dd></div>}
            {result.density && <div><dt>Density</dt><dd>{DENSITY_LABELS[result.density]}</dd></div>}
            {result.gray && <div><dt>Gray</dt><dd>{GRAY_LABELS[result.gray]}</dd></div>}
            {result.measurement.youcamHairClass && <div><dt>YouCam hair color</dt><dd>{result.measurement.youcamHairClass}</dd></div>}
          </dl>
          {(result.measurement.measuredHex || result.measurement.youcamHairHex) && (
            <div className="measure-chips">
              {result.measurement.measuredHex && <span><i style={{ background: result.measurement.measuredHex }} /> Measured on device</span>}
              {result.measurement.youcamHairHex && <span><i style={{ background: result.measurement.youcamHairHex }} /> YouCam class</span>}
            </div>
          )}
          <button type="button" className="button secondary full" onClick={() => onApply(result)}>Use these suggestions</button>
          <p className="small muted">Then check each choice against your hair in daylight — photos often read hair darker than it is.</p>
        </div>
      )}
    </section>
  );
}
