import clsx from 'clsx';
import { useVideoDisclosure } from '../../hooks/useVideoDisclosure';
import type { PlayableClip } from '../../lib/playable-clip';
import { ClipFilmstrip } from '../ClipFilmstrip/ClipFilmstrip';
import { clipDurationMs, frameTimeLabel } from '../ClipFilmstrip/clip-filmstrip';
import { ClipPlaybackPanel } from '../ClipPlaybackPanel/ClipPlaybackPanel';
import type { GalleryFrame } from '../FrameGallery/FrameGallery';
import { FramePair } from '../FramePair/FramePair';
import { PlaybackToggle } from '../PlaybackToggle/PlaybackToggle';
import styles from './TransitionMedia.module.css';

export type TransitionMediaProps = Readonly<{
  before: GalleryFrame;
  after: GalleryFrame;
  clip?: PlayableClip;
  className?: string;
  expandedClassName?: string;
  videoClassName?: string;
}>;

/** Compose clip preview and playback without event semantics. */
export function TransitionMedia({ before, after, clip, className, expandedClassName, videoClassName }: TransitionMediaProps) {
  const { open, controlsId, toggle } = useVideoDisclosure();
  const playableClip = clip && clip.trace.length > 0 ? clip : undefined;
  return (
    <div className={clsx(styles['transition-media'], className)}>
      <FramePair
        before={before}
        after={after}
        expandedClassName={expandedClassName}
      >
        {playableClip && <ClipFilmstrip clip={playableClip} previewEnabled={!open} />}
      </FramePair>
      {playableClip && (
        <div className={styles['transition-media__controls']}>
          <PlaybackToggle open={open} controlsId={controlsId} onToggle={toggle} compact />
          <span className={styles['transition-media__duration']}>{frameTimeLabel(clipDurationMs(playableClip.trace))}</span>
        </div>
      )}
      {playableClip && open && <ClipPlaybackPanel clip={playableClip} id={controlsId} className={videoClassName} />}
    </div>
  );
}
