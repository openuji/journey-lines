import type { Clip } from '@journey-lines/core';
import { itemFile, type ReportExport } from '@journey-lines/journey';
import { storyCaptures, storyClip, storyTransitionClip, transitionFrames } from '@journey-lines/journey/fixtures';
import type { PlayableClip } from '../lib/playable-clip';
import type { ReaderMedia } from '../ui/ReaderDocument/ReaderStep';
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

/** The fixtures' clips as a browser plays them; they are small enough for data URLs. */
const playable = (clip: Clip): PlayableClip => ({ src: `data:${clip.mimeType};base64,${clip.base64}`, trace: clip.trace });
export const storyPlayableClip = playable(storyClip);
export const storyPlayableTransitionClip = playable(storyTransitionClip);

/** Every archive file of a fixture report as a data URL, as a reader would load it. */
export function storyMedia(report: ReportExport): ReaderMedia {
  return Object.fromEntries(report.recording.items.map((item) => [
    itemFile(item),
    item.kind === 'capture'
      ? `data:image/png;base64,${item.capture.frame.base64}`
      : `data:${item.clip.mimeType};base64,${item.clip.base64}`,
  ]));
}
