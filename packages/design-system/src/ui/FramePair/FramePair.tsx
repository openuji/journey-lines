import type { ReactNode } from 'react';
import clsx from 'clsx';
import { FrameThumbnail } from '../FrameThumbnail/FrameThumbnail';
import type { GalleryFrame } from '../FrameGallery/FrameGallery';
import styles from './FramePair.module.css';

export type FrameRole = 'before' | 'after';

export type FramePairProps = Readonly<{
  before: GalleryFrame;
  after: GalleryFrame;
  /** Which of the two is shown large elsewhere, if either. */
  expanded: FrameRole | null;
  /** The element that shows it. */
  controlsId: string;
  onToggle: (frame: FrameRole) => void;
  /** Between before and after: the transition, such as a filmstrip. */
  children: ReactNode;
  /** After the pair, such as its playback control. */
  aside?: ReactNode;
  className?: string;
}>;

/** A compact before/transition/after row. Where a frame is shown large is its host's choice. */
export function FramePair({ before, after, expanded, controlsId, onToggle, children, aside, className }: FramePairProps) {
  const thumbnail = (frame: GalleryFrame, role: FrameRole) => (
    <FrameThumbnail
      src={frame.src}
      label={frame.label}
      expanded={expanded === role}
      controlsId={controlsId}
      onToggle={() => onToggle(role)}
    />
  );

  return (
    <div className={clsx(styles['frame-pair'], className)}>
      <span className={styles['frame-pair__before-label']}>{before.caption ?? before.label}</span>
      <span className={styles['frame-pair__after-label']}>{after.caption ?? after.label}</span>
      <div className={styles['frame-pair__before-frame']}>{thumbnail(before, 'before')}</div>
      <div className={styles['frame-pair__transition']}>{children}</div>
      <div className={styles['frame-pair__after-frame']}>{thumbnail(after, 'after')}</div>
      {aside && <div className={styles['frame-pair__aside']}>{aside}</div>}
    </div>
  );
}
