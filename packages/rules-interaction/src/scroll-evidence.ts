import type { MilestoneCapture } from '@openuji/core';
import type { FrameSample } from './visual.js';

/** Evidence decided by one scroll evaluation, consumed immediately. */
export type ScrollEvidence = Readonly<{
  episodeId: string;
  confirmedFrames: readonly FrameSample[];
  completion:
    | Readonly<{ kind: 'accepted'; post: MilestoneCapture }>
    | Readonly<{ kind: 'discarded' }>
    | null;
}>;
