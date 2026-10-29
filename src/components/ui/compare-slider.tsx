"use client";

import { useCallback, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

interface CompareSliderProps {
  before: ReactNode;
  after: ReactNode;
  beforeLabel: string;
  afterLabel: string;
  /** Width / height of the frame, e.g. 3 / 4 for portrait photos. */
  ratio?: number;
  initial?: number;
  className?: string;
}

/**
 * Before/after comparison: drag (mouse or touch), tap, or use the arrow keys to move the divider.
 * Both layers fill the same frame, so photos must share one aspect ratio.
 */
export function CompareSlider({ before, after, beforeLabel, afterLabel, ratio = 3 / 4, initial = 50, className = "" }: CompareSliderProps) {
  const [pos, setPos] = useState(initial);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = useCallback((clientX: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setPos(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)));
  }, []);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 20 : 5;
    const next = { ArrowLeft: pos - step, ArrowRight: pos + step, Home: 0, End: 100 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setPos(Math.min(100, Math.max(0, next)));
  }

  return (
    <div
      ref={frame}
      className={`compare ${className}`}
      style={{ aspectRatio: ratio, "--ratio": ratio, "--pos": `${pos}%` } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => dragging.current && moveTo(e.clientX)}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
    >
      <div className="compare-layer">{after}</div>
      <div className="compare-layer compare-before" aria-hidden="true">{before}</div>
      <span className="compare-tag start" aria-hidden="true">{beforeLabel}</span>
      <span className="compare-tag end" aria-hidden="true">{afterLabel}</span>
      <div
        className="compare-handle"
        role="slider"
        tabIndex={0}
        aria-label={`Compare ${beforeLabel} with ${afterLabel}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-valuetext={`${Math.round(pos)}% ${beforeLabel}, ${100 - Math.round(pos)}% ${afterLabel}`}
        onKeyDown={onKeyDown}
      >
        <span className="compare-knob" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </div>
    </div>
  );
}
