import type { Clip } from '@openuji/core';
import { ClipPlaybackPanel } from '../ClipPlaybackPanel/ClipPlaybackPanel';
import { ClipRange } from '../ClipRange/ClipRange';
import type { GalleryFrame } from '../FrameGallery/FrameGallery';
import { FramePair } from '../FramePair/FramePair';
import { PlaybackToggle } from '../PlaybackToggle/PlaybackToggle';
import { usePlayback } from '../../hooks/usePlayback';

export type TransitionMediaProps = Readonly<{
  before: GalleryFrame;
  after: GalleryFrame;
  clip?: Clip;
  className?: string;
  expandedClassName?: string;
  videoClassName?: string;
}>;

/** Compose the gallery, range and playback controls without event semantics. */
export function TransitionMedia({ before, after, clip, className, expandedClassName, videoClassName }: TransitionMediaProps) {
  const { playing, controlsId, toggle } = usePlayback();
  return (
    <>
      <FramePair
        before={before}
        after={after}
        className={className}
        expandedClassName={expandedClassName}
      >
        <ClipRange clip={clip} />
        {clip && <PlaybackToggle playing={playing} controlsId={controlsId} onToggle={toggle} compact />}
      </FramePair>
      {clip && playing && <ClipPlaybackPanel clip={clip} id={controlsId} className={videoClassName} />}
    </>
  );
}
