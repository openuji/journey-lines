import type { GalleryFrame } from '../ui/FrameGallery';
import { storyCaptures } from './fixtures';
import { storyReportWithClip } from './report-sessions';

export const storyGalleryFrames: readonly GalleryFrame[] = [
  { id: 'before', label: 'Before', caption: 'Before', src: `data:image/png;base64,${storyCaptures[1]!.frame.base64}` },
  { id: 'after', label: 'After', caption: 'After', src: `data:image/png;base64,${storyCaptures[2]!.frame.base64}` },
];

export const storyClip = storyReportWithClip.items.flatMap((item) => item.kind === 'clip' ? [item.clip] : [])[0]!;
