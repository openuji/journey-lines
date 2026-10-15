import type { ClipTraceSample } from '@journey-lines/core';

export const FILMSTRIP_FRAME_LIMIT = 3;

/** Stills are captured at twice the preview's width, so its enlargement stays sharp. */
export const FILMSTRIP_STILL_WIDTH = 448;

export type SampledFrame = Readonly<{
  traceIndex: number;
  sample: ClipTraceSample;
}>;

/** Evenly sample a trace while always retaining both endpoints. */
export function sampleFrameIndices(frameCount: number, limit = FILMSTRIP_FRAME_LIMIT): readonly number[] {
  const count = Math.max(0, Math.trunc(frameCount));
  const sampleCount = Math.min(count, Math.max(0, Math.trunc(limit)));
  if (sampleCount === 0) return [];
  if (sampleCount === 1) return [0];
  return Array.from(
    { length: sampleCount },
    (_, position) => Math.round((position * (count - 1)) / (sampleCount - 1)),
  );
}

export function sampledFrames(trace: readonly ClipTraceSample[]): readonly SampledFrame[] {
  return sampleFrameIndices(trace.length).map((traceIndex) => ({ traceIndex, sample: trace[traceIndex]! }));
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

export function clipDurationMs(trace: readonly ClipTraceSample[]): number {
  return trace.at(-1)?.atMs ?? 0;
}

export function keyboardFrame(key: string, current: number, last: number): number | undefined {
  const positions = [
    ['ArrowLeft', current - 1], ['ArrowDown', current - 1],
    ['ArrowRight', current + 1], ['ArrowUp', current + 1],
    ['Home', 0], ['End', last],
  ] as const;
  const position = positions.find(([name]) => name === key)?.[1];
  return position === undefined ? undefined : Math.min(last, Math.max(0, position));
}
