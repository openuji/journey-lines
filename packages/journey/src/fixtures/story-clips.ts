import type { Clip } from '@openuji/core';
import { storyReportWithClip } from './report-sessions.js';
import { transitionFrames, transitionVideo } from './transition-fixture.js';

export const storyClip = storyReportWithClip.items.flatMap((item) => item.kind === 'clip' ? [item.clip] : [])[0]!;

/** A clip whose frames are distinct, so scrubbing shows a change. */
export const storyTransitionClip: Clip = {
  ...storyClip,
  ...transitionVideo,
  trace: transitionFrames.map((frame, frameIndex) => ({ frameIndex, atMs: frame.atMs })),
};
