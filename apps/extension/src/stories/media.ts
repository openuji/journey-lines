import type { GalleryFrame } from '../ui/FrameGallery/FrameGallery';
import type { Clip } from '@openuji/core';
import { storyCaptures } from './fixtures';
import { storyReportWithClip } from './report-sessions';
import { transitionFrames, transitionVideo } from './transition-fixture';

export const storyGalleryFrames: readonly GalleryFrame[] = [
  { id: 'before', label: 'Before', caption: 'Before', src: `data:image/png;base64,${storyCaptures[1]!.frame.base64}` },
  { id: 'after', label: 'After', caption: 'After', src: `data:image/png;base64,${storyCaptures[2]!.frame.base64}` },
];

export const storyClip = storyReportWithClip.items.flatMap((item) => item.kind === 'clip' ? [item.clip] : [])[0]!;

/** Distinct endpoint and intermediate frames for scrubbing review. */
export const storyTransitionFrames: readonly GalleryFrame[] = [
  { id: 'before', label: 'Before', caption: 'Before', src: `data:image/png;base64,${transitionFrames[0].base64}` },
  { id: 'after', label: 'After', caption: 'After', src: `data:image/png;base64,${transitionFrames[2].base64}` },
];

export const storyTransitionClip: Clip = {
  ...storyClip,
  ...transitionVideo,
  trace: transitionFrames.map((frame, frameIndex) => ({ frameIndex, atMs: frame.atMs })),
};
