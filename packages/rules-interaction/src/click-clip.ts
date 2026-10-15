import type { ClipWrite, MilestoneCapture } from '@journey-lines/core';
import { frameWrites, type FrameRange } from './visual.js';

/** Project the click's selected range into its optional video output. */
export function clickClipWrites(
  id: string,
  range: FrameRange,
  post: MilestoneCapture,
): readonly ClipWrite[] {
  return [
    ...frameWrites(id, [range.before, ...range.between, range.after]),
    { type: 'keep', id, capture: post },
  ];
}
