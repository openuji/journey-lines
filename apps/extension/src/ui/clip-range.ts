import type { ClipTraceSample } from '@openuji/core';

export type PreviewAnchor = Readonly<{ left: number; right: number; top: number; bottom: number }>;
export type PreviewViewport = Readonly<{ width: number; height: number }>;
export const RANGE_THUMB_PX = 10;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** The frame on screen at this time; no interpolation between recorded frames. */
export function frameIndexAt(trace: readonly ClipTraceSample[], atMs: number): number {
  const next = trace.findIndex((sample) => sample.atMs > atMs);
  return next === -1 ? Math.max(0, trace.length - 1) : Math.max(0, next - 1);
}

export function rangeTimeAt(clientX: number, left: number, width: number, endMs: number): number {
  return clamp((clientX - left) / Math.max(1, width), 0, 1) * endMs;
}

export function keyboardFrame(key: string, current: number, last: number): number | undefined {
  const positions = [
    ['ArrowLeft', current - 1], ['ArrowDown', current - 1],
    ['ArrowRight', current + 1], ['ArrowUp', current + 1],
    ['Home', 0], ['End', last],
  ] as const;
  const position = positions.find(([name]) => name === key)?.[1];
  return position === undefined ? undefined : clamp(position, 0, last);
}

/** Seek inside a frame's interval to avoid decoder rounding at its boundary. */
export function frameSeekTime(trace: readonly ClipTraceSample[], index: number): number {
  const atMs = trace[index]?.atMs ?? 0;
  const nextMs = trace[index + 1]?.atMs ?? atMs + 1;
  return (atMs + Math.min(0.5, (nextMs - atMs) / 2)) / 1000;
}

export function frameTimeLabel(atMs: number): string {
  return `${(atMs / 1000).toFixed(2)} s`;
}

/** Prefer above the range; keep every edge inside the current viewport. */
export function previewPlacement(anchor: PreviewAnchor, viewport: PreviewViewport) {
  const margin = 8;
  const width = Math.max(1, Math.min(224, viewport.width - margin * 2));
  const height = Math.max(1, Math.min(160, viewport.height - margin * 2));
  const above = anchor.top - height - margin;
  const preferredTop = above >= margin ? above : anchor.bottom + margin;
  return {
    width, height,
    left: clamp((anchor.left + anchor.right - width) / 2, margin, Math.max(margin, viewport.width - width - margin)),
    top: clamp(preferredTop, margin, Math.max(margin, viewport.height - height - margin)),
  };
}
