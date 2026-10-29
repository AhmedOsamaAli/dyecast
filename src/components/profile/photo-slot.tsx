"use client";

import { Camera, Upload } from "lucide-react";
import { useState, useSyncExternalStore, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { CameraDialog } from "@/components/ui/camera-dialog";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic";
const TOUCH_SCREEN = "(pointer: coarse)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(TOUCH_SCREEN);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Phones and tablets open their own camera app (the best photo quality); computers use the camera in the page. */
function useNativeCamera(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(TOUCH_SCREEN).matches, () => false);
}

interface PhotoSlotProps {
  label: string;
  hint: string;
  preview?: string;
  previewAlt: string;
  disabled?: boolean;
  onPhoto: (photo: File) => void;
  /** Title and posing tip shown with the camera. */
  cameraTitle: string;
  cameraTip: string;
  facing?: "user" | "environment";
  /** A self-timer, for poses where the screen is hard to see. Used by the in-page camera. */
  countdown?: number;
  className?: string;
}

/** One photo, two ways in: take it with the camera, or upload one. */
export function PhotoSlot({
  label, hint, preview, previewAlt, disabled = false, onPhoto, cameraTitle, cameraTip, facing = "user", countdown, className = "",
}: PhotoSlotProps) {
  const nativeCamera = useNativeCamera();
  const [cameraOpen, setCameraOpen] = useState(false);

  function picked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // so picking the same file again still counts
    if (file) onPhoto(file);
  }

  const forSlot = <span className="sr-only"> ({label})</span>;
  const takeText = preview ? "Retake" : "Take photo";

  return (
    <div className={`upload-tile photo-slot ${preview ? "has-photo" : ""} ${disabled ? "disabled" : ""} ${className}`}>
      {preview ? <img src={preview} alt={previewAlt} /> : <span>{label}<br /><small>{hint}</small></span>}
      <div className="photo-slot-actions">
        {nativeCamera ? (
          <label className="tile-action">
            <Camera size={15} aria-hidden="true" /> {takeText}{forSlot}
            <input type="file" accept={ACCEPT} capture={facing} disabled={disabled} onChange={picked} />
          </label>
        ) : (
          <button type="button" className="tile-action" disabled={disabled} onClick={() => setCameraOpen(true)}>
            <Camera size={15} aria-hidden="true" /> {takeText}{forSlot}
          </button>
        )}
        <label className="tile-action">
          <Upload size={15} aria-hidden="true" /> {preview ? "Change" : "Upload"}{forSlot}
          <input type="file" accept={ACCEPT} disabled={disabled} onChange={picked} />
        </label>
      </div>
      {cameraOpen &&
        createPortal(
          <CameraDialog title={cameraTitle} tip={cameraTip} facing={facing} countdown={countdown} onCapture={onPhoto} onClose={() => setCameraOpen(false)} />,
          document.body,
        )}
    </div>
  );
}
