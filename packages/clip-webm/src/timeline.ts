import { QUIET_AFTER_MS } from '@openuji/core';

/**
 * Where a clip's frames sit in its video: the one place video time is decided.
 *
 *  - The first frame, the page before the scroll or the click, starts the video.
 *  - It was proven at rest by being still for a while, possibly seconds, so
 *    it is shown for at most `QUIET_AFTER_MS` before the next frame.
 *  - Every later frame keeps its real spacing, by `receivedAtMs`.
 *  - The last frame, where the scroll landed or the click's response came to
 *    rest, stays for `QUIET_AFTER_MS`: as long as it was proven at rest.
 *
 * Times are whole ms, as WebM stores them, and always increase.
 */
export type Timeline = Readonly<{
  /** When the first frame arrived. */
  restMs: number;
  /** Video time 0 on the arrival clock; set by the second frame. */
  originMs: number | null;
  /** The latest frame's time in the video. */
  lastMs: number;
}>;

/** The time of a frame that arrived at `receivedAtMs`, and the timeline after it. Pure. */
export function place(timeline: Timeline | null, receivedAtMs: number): [atMs: number, next: Timeline] {
  if (!timeline) return [0, { restMs: receivedAtMs, originMs: null, lastMs: 0 }];

  const originMs =
    timeline.originMs ??
    receivedAtMs - Math.min(receivedAtMs - timeline.restMs, QUIET_AFTER_MS);
  const atMs = Math.max(Math.round(receivedAtMs - originMs), timeline.lastMs + 1);
  return [atMs, { ...timeline, originMs, lastMs: atMs }];
}

/** When the video ends: the last frame held for `QUIET_AFTER_MS`. */
export function endOf(timeline: Timeline): number {
  return timeline.lastMs + QUIET_AFTER_MS;
}
