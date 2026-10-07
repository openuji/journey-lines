import { QUIET_AFTER_MS, type CompositorFrame } from '@openuji/core';

/**
 * Which frame shows the page at rest.
 *
 * A screencast frame's image can be newer than the offset it reports: Chrome
 * stamps each capture with the offset of the frame that triggered it, then
 * copies a later one. So a frame that reports no motion may already show some.
 * It is proven at rest only once `QUIET_AFTER_MS` has passed after it with no
 * frame reporting motion: by then the reports have caught up with its image,
 * or nothing was painted at all.
 *
 * This only keeps time. What counts as motion is the caller's decision.
 */
export type Rest = Readonly<{
  /** The latest frame proven at rest; null until one is. */
  proven: CompositorFrame | null;
  /** Frames since the last motion, oldest first, waiting for their proof. */
  pending: readonly Waiting[];
}>;

/** A frame waiting for its proof, and when its stillness started counting. */
export type Waiting = Readonly<{ frame: CompositorFrame; sinceMs: number }>;

export const NOTHING_PROVEN: Rest = { proven: null, pending: [] };

/** `atMs` has come: each pending frame `QUIET_AFTER_MS` older is proven. */
export function elapse(rest: Rest, atMs: number): Rest {
  const stillWaiting = rest.pending.findIndex(
    (waiting) => atMs - waiting.sinceMs < QUIET_AFTER_MS,
  );
  const provenCount = stillWaiting === -1 ? rest.pending.length : stillWaiting;
  if (provenCount === 0) return rest;

  return {
    proven: rest.pending[provenCount - 1]?.frame ?? rest.proven,
    pending: rest.pending.slice(provenCount),
  };
}

/**
 * A frame that reported no motion: it waits for its proof, counted from
 * `sinceMs`, by default when it arrived.
 */
export function hold(
  rest: Rest,
  frame: CompositorFrame,
  sinceMs: number = frame.receivedAtMs,
): Rest {
  return { ...rest, pending: [...rest.pending, { frame, sinceMs }] };
}

/**
 * A frame that reported motion: the proof starts over from it. What was
 * proven stays proven, as the last view of the page at rest.
 */
export function restart(rest: Rest, frame: CompositorFrame): Rest {
  return { ...rest, pending: [{ frame, sinceMs: frame.receivedAtMs }] };
}

/**
 * `frame`, or a later one, is proven at rest. Compared by frame index, not
 * time, so frames stamped alike can't be confused.
 */
export function isProven(rest: Rest, frame: CompositorFrame): boolean {
  return rest.proven !== null && rest.proven.index >= frame.index;
}
