import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Clip } from '@openuji/core';
import clsx from 'clsx';
import { FrameGallery, type GalleryFrame } from '../FrameGallery/FrameGallery';
import { TransitionMedia } from '../TransitionMedia/TransitionMedia';
import styles from './TimelineRow.module.css';

export type TimelineRowProps = Readonly<{
  time: string;
  title: string;
  icon: LucideIcon;
  tone: 'page' | 'click' | 'scroll' | 'exit';
  subtitle?: Readonly<{ text: string; title?: string }>;
  frames: readonly GalleryFrame[];
  clip?: Clip;
  /** Below the media: whatever the host adds to the row. */
  children?: ReactNode;
}>;

/** Layout only: this component has no knowledge of captures or journey rules. */
export function TimelineRow({ time, title, icon: Icon, tone, subtitle, frames, clip, children }: TimelineRowProps) {
  const [before, after] = frames;
  return (
    <li className={clsx(styles['timeline-row'], styles[`timeline-row--${tone}`])} data-tone={tone}>
      <time className={styles['timeline-row__time']}>{time}</time>
      <Icon className={styles['timeline-row__icon']} strokeWidth={1.75} aria-hidden />
      <div className={styles['timeline-row__heading']}>
        <span className={styles['timeline-row__label']} data-event-title>{title}</span>
        {subtitle && <span className={styles['timeline-row__subtitle']} title={subtitle.title}>{subtitle.text}</span>}
      </div>
      {before && after ? (
        <TransitionMedia
          before={before}
          after={after}
          clip={clip}
          className={styles['timeline-row__media']}
          expandedClassName={styles['timeline-row__frame']}
          videoClassName={styles['timeline-row__video']}
        />
      ) : <FrameGallery frames={frames} className={styles['timeline-row__media']} expandedClassName={styles['timeline-row__frame']} />}
      {children && <div className={styles['timeline-row__extra']}>{children}</div>}
    </li>
  );
}
