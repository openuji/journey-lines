import { useId, useState } from 'react';
import clsx from 'clsx';
import type { PlayableClip } from '../../lib/playable-clip';
import { ClipFilmstrip } from '../ClipFilmstrip/ClipFilmstrip';
import { clipDurationMs, frameTimeLabel } from '../ClipFilmstrip/clip-filmstrip';
import { ClipPlaybackPanel } from '../ClipPlaybackPanel/ClipPlaybackPanel';
import type { GalleryFrame } from '../FrameGallery/FrameGallery';
import { FramePair, type FrameRole } from '../FramePair/FramePair';
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

/** What is shown large below the pair: one of its frames or its clip, never two at once. */
type Showcase = FrameRole | 'video' | null;

/** Compose clip preview and playback without event semantics. */
export function TransitionMedia({ before, after, clip, className, expandedClassName, videoClassName }: TransitionMediaProps) {
  const [showcase, setShowcase] = useState<Showcase>(null);
  const showcaseId = `transition-media-${useId().replaceAll(':', '')}`;
  const toggle = (shown: Exclude<Showcase, null>) => setShowcase((current) => current === shown ? null : shown);
  const playableClip = clip && clip.trace.length > 0 ? clip : undefined;
  const frame = showcase === 'before' ? before : showcase === 'after' ? after : undefined;

  return (
    <div className={clsx(styles['transition-media'], className)}>
      <FramePair
        before={before}
        after={after}
        expanded={showcase === 'video' ? null : showcase}
        controlsId={showcaseId}
        onToggle={toggle}
        aside={playableClip && (
          <div className={styles['transition-media__controls']}>
            <PlaybackToggle open={showcase === 'video'} controlsId={showcaseId} onToggle={() => toggle('video')} compact />
            <span className={styles['transition-media__duration']}>{frameTimeLabel(clipDurationMs(playableClip.trace))}</span>
          </div>
        )}
      >
        {playableClip && <ClipFilmstrip clip={playableClip} previewEnabled={showcase !== 'video'} />}
      </FramePair>
      {frame?.src && (
        <img
          id={showcaseId}
          className={clsx(styles['transition-media__frame'], expandedClassName)}
          src={frame.src}
          alt={`${frame.label} frame`}
        />
      )}
      {showcase === 'video' && playableClip && (
        <ClipPlaybackPanel clip={playableClip} id={showcaseId} className={clsx(styles['transition-media__video'], videoClassName)} />
      )}
    </div>
  );
}
