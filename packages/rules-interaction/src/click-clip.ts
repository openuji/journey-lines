import type { ClipWrite, MilestoneCapture } from '@openuji/core';
import type { ClickFrame } from './click.js';

/**
 * Encode the exact range chosen for the screenshots, once its end is known.
 * Frames beyond the next press remain available to the following segment.
 * There is no overlapping encoder to trim or drop. An unchanged screen still
 * has its captures, but needs no video.
 */
export function clickClipWrites(
  id: string,
  seen: readonly ClickFrame[],
  pre: MilestoneCapture | undefined,
  post: MilestoneCapture | undefined,
): ClipWrite[] {
  if (!pre || !post || pre.frame === post.frame) return [];
  const start = seen.findIndex(({ frame }) => frame === pre.frame);
  const end = seen.findIndex(({ frame }) => frame === post.frame);
  if (start < 0 || end <= start) return [];
  return [
    ...seen.slice(start, end + 1).map(({ frame, position }): ClipWrite => ({ type: 'frame', id, frame, position })),
    { type: 'keep', id, capture: post },
  ];
}
