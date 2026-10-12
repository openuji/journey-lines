import type { Clip } from '@openuji/core';
import { ClipPlaybackPanel } from '../ClipPlaybackPanel/ClipPlaybackPanel';
import { ClipRange } from '../ClipRange/ClipRange';
import { FrameGallery, type GalleryFrame } from '../FrameGallery/FrameGallery';
import { PlaybackToggle } from '../PlaybackToggle/PlaybackToggle';
import { usePlayback } from '../hooks/usePlayback';
import styles from './TransitionMedia.module.css';

export type TransitionMediaProps = Readonly<{
  frames: readonly GalleryFrame[];
  clip?: Clip;
  className?: string;
  expandedClassName?: string;
  videoClassName?: string;
}>;

/** Compose the gallery, range and playback controls without event semantics. */
export function TransitionMedia({ frames, clip, className, expandedClassName, videoClassName }: TransitionMediaProps) {
  const { playing, controlsId, toggle } = usePlayback();
  return (
    <>
      <FrameGallery
        frames={frames}
        className={className}
        expandedClassName={expandedClassName}
        separator={(
          <div className={styles['transition-media__controls']}>
            <ClipRange clip={clip} />
            {clip && <PlaybackToggle playing={playing} controlsId={controlsId} onToggle={toggle} compact />}
          </div>
        )}
      />
      {clip && playing && <ClipPlaybackPanel clip={clip} id={controlsId} className={videoClassName} />}
    </>
  );
}
