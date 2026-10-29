"use client";

import { Camera, RefreshCw, SwitchCamera, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cameraErrorMessage, canUseCamera, NO_CAMERA_MESSAGE } from "@/lib/client/camera";

type Facing = "user" | "environment";
type Phase = "starting" | "live" | "countdown" | "review" | "error";

interface CameraDialogProps {
  title: string;
  /** How to pose, shown under the camera. */
  tip: string;
  facing?: Facing;
  /** Seconds to count down before the photo, so there's time to pose (for example with the head tilted down). */
  countdown?: number;
  onCapture: (photo: File) => void;
  onClose: () => void;
}

/**
 * Takes a photo with the device camera inside the page (for computers, where file inputs can't open a camera).
 * The camera runs only while the live view shows: it stops as soon as the photo is taken or the dialog closes.
 * Nothing is uploaded here; the photo is handed to `onCapture` like a chosen file.
 */
export function CameraDialog({ title, tip, facing: initialFacing = "user", countdown = 0, onCapture, onClose }: CameraDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timers = useRef<number[]>([]);
  const [supported] = useState(canUseCamera);
  const [facing, setFacing] = useState<Facing>(initialFacing);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>(supported ? "starting" : "error");
  const [error, setError] = useState(supported ? "" : NO_CAMERA_MESSAGE);
  const [cameras, setCameras] = useState(0);
  const [count, setCount] = useState(0);
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);

  // A modal: focus stays inside and Esc closes it. Pending timer steps are cancelled on close.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    const pending = timers.current;
    return () => {
      pending.forEach((t) => window.clearTimeout(t));
      dialog?.close();
    };
  }, []);

  // The live camera, while there's no photo to review.
  useEffect(() => {
    if (!supported || shot) return;
    const video = videoRef.current;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then(async (started) => {
        if (cancelled) {
          started.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = started;
        if (video) {
          video.srcObject = started;
          await video.play().catch(() => undefined);
        }
        const devices = await navigator.mediaDevices.enumerateDevices().catch((): MediaDeviceInfo[] => []);
        if (cancelled) return;
        setCameras(devices.filter((d) => d.kind === "videoinput").length);
        setPhase("live");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(cameraErrorMessage(e));
        setPhase("error");
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, [supported, shot, facing, attempt]);

  // Free the reviewed photo's preview when it's replaced or the dialog closes.
  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url);
  }, [shot]);

  async function capture() {
    timers.current.splice(0);
    const video = videoRef.current;
    if (!video?.videoWidth) {
      setPhase("live");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Keep what the preview showed: the front camera is shown mirrored, like a mirror.
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setError("The photo couldn't be saved. Try again.");
      setPhase("error");
      return;
    }
    setShot({ file: new File([blob], "camera-photo.jpg", { type: "image/jpeg" }), url: URL.createObjectURL(blob) });
    setPhase("review");
  }

  function shoot() {
    if (countdown <= 0) {
      void capture();
      return;
    }
    setCount(countdown);
    setPhase("countdown");
    for (let step = 1; step <= countdown; step++) {
      timers.current.push(
        window.setTimeout(() => (step < countdown ? setCount(countdown - step) : void capture()), step * 1000),
      );
    }
  }

  function cancelCountdown() {
    timers.current.splice(0).forEach((t) => window.clearTimeout(t));
    setPhase("live");
  }

  function retake() {
    setShot(null);
    setPhase("starting");
  }

  function retry() {
    setError("");
    setPhase("starting");
    setAttempt((n) => n + 1);
  }

  function switchCamera() {
    setPhase("starting");
    setFacing((f) => (f === "user" ? "environment" : "user"));
  }

  function acceptPhoto() {
    if (!shot) return;
    onCapture(shot.file);
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="camera-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="camera-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close the camera">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="camera-stage">
        {phase === "error" ? (
          <p className="camera-message" role="alert">{error}</p>
        ) : (
          <>
            <video ref={videoRef} className={facing === "user" ? "mirrored" : undefined} autoPlay muted playsInline aria-label="Camera preview" hidden={phase === "review"} />
            {phase === "review" && shot && <img src={shot.url} alt="The photo you just took" />}
            {phase !== "review" && <div className="camera-guide" aria-hidden="true" />}
            {phase === "starting" && <p className="camera-message">Starting the camera…</p>}
            {phase === "countdown" && <p className="camera-count" aria-live="assertive">{count}</p>}
          </>
        )}
      </div>

      <p className="camera-tip">{tip}</p>

      <div className="camera-actions">
        {phase === "review" ? (
          <>
            <button type="button" className="button secondary" onClick={retake}>
              <RefreshCw size={16} aria-hidden="true" /> Retake
            </button>
            <button type="button" className="button" onClick={acceptPhoto}>Use this photo</button>
          </>
        ) : phase === "error" ? (
          <>
            <button type="button" className="button secondary" onClick={onClose}>Close</button>
            {supported && <button type="button" className="button" onClick={retry}>Try again</button>}
          </>
        ) : phase === "countdown" ? (
          <button type="button" className="button secondary" onClick={cancelCountdown}>Cancel the timer</button>
        ) : (
          <>
            {cameras > 1 && (
              <button type="button" className="button secondary" onClick={switchCamera}>
                <SwitchCamera size={16} aria-hidden="true" /> Switch camera
              </button>
            )}
            <button type="button" className="button" onClick={shoot} disabled={phase !== "live"}>
              <Camera size={16} aria-hidden="true" /> {countdown > 0 ? `Take photo in ${countdown} s` : "Take photo"}
            </button>
          </>
        )}
      </div>

      <p className="camera-note small muted">The camera turns off as soon as the photo is taken. Nothing is uploaded from this window.</p>
    </dialog>
  );
}
