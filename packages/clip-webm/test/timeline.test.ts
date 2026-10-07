import { describe, expect, it } from 'vitest';
import { QUIET_AFTER_MS } from '@openuji/core';
import { endOf, place, type Timeline } from '@openuji/clip-webm';

/** The video times of frames that arrived at `arrivals`, and the video's end. */
function times(arrivals: readonly number[]): { at: number[]; end: number } {
  let timeline: Timeline | null = null;
  const at = arrivals.map((receivedAtMs) => {
    const [atMs, next] = place(timeline, receivedAtMs);
    timeline = next;
    return atMs;
  });
  return { at, end: timeline ? endOf(timeline) : NaN };
}

describe('clip timeline', () => {
  it('starts at the frame at rest, cuts its long stillness to 250 ms, then keeps real spacing', () => {
    // At rest since 0; the scroll's first frame comes 4 s later.
    expect(times([0, 4_000, 4_016, 4_040])).toEqual({ at: [0, 250, 266, 290], end: 540 });
  });

  it('keeps a short lead as it was', () => {
    expect(times([1_000, 1_007, 1_020]).at).toEqual([0, 7, 20]);
  });

  it('holds the landing frame for as long as it was proven at rest', () => {
    const { at, end } = times([0, 300, 316]);
    expect(end - (at.at(-1) ?? NaN)).toBe(QUIET_AFTER_MS);
  });

  it('gives frames stamped alike, or a fraction of a ms apart, increasing whole ms', () => {
    expect(times([0, 10, 10, 10.4, 12]).at).toEqual([0, 10, 11, 12, 13]);
  });
});
