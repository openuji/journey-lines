import { storyCaptures, transitionFrames } from '@openuji/journey/fixtures';
import type { GalleryFrame } from '../ui/FrameGallery/FrameGallery';

export const storyGalleryFrames: readonly GalleryFrame[] = [
  { id: 'before', label: 'Before', caption: 'Before', src: `data:image/png;base64,${storyCaptures[1]!.frame.base64}` },
  { id: 'after', label: 'After', caption: 'After', src: `data:image/png;base64,${storyCaptures[2]!.frame.base64}` },
];

/** Distinct endpoint and intermediate frames for scrubbing review. */
export const storyTransitionFrames: readonly GalleryFrame[] = [
  { id: 'before', label: 'Before', caption: 'Before', src: `data:image/png;base64,${transitionFrames[0].base64}` },
  { id: 'after', label: 'After', caption: 'After', src: `data:image/png;base64,${transitionFrames[2].base64}` },
];
