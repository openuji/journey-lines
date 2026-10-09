import type { ClipWrite } from '@openuji/core';
import type { ScrollEvidence } from './scroll-evidence.js';
import { frameWrites } from './visual.js';

/** Project confirmed scroll evidence into its optional video output. */
export function scrollClipWrites(evidence: ScrollEvidence): readonly ClipWrite[] {
  const { episodeId, confirmedFrames, completion } = evidence;
  const frames = frameWrites(episodeId, confirmedFrames);
  if (completion === null) return frames;
  if (completion.kind === 'discarded') return [...frames, { type: 'drop', id: episodeId }];
  return [...frames, { type: 'keep', id: episodeId, capture: completion.post }];
}
