import type { LucideIcon } from 'lucide-react';
import type { Clip } from '@openuji/core';
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
}>;

/** Layout only: this component has no knowledge of captures or journey rules. */
export function TimelineRow({ time, title, icon: Icon, tone, subtitle, frames, clip }: TimelineRowProps) {
  return (
    <li className={`${styles['timeline-row']} ${styles[`timeline-row--${tone}`] ?? ''}`} data-tone={tone}>
      <time className={styles['timeline-row__time']}>{time}</time>
      <Icon className={styles['timeline-row__icon']} strokeWidth={1.75} aria-hidden />
      <div className={styles['timeline-row__heading']}>
        <span className={styles['timeline-row__label']} data-event-title>{title}</span>
        {subtitle && <span className={styles['timeline-row__subtitle']} title={subtitle.title}>{subtitle.text}</span>}
      </div>
      {frames.length > 1 ? (
        <TransitionMedia
          frames={frames}
          clip={clip}
          className={styles['timeline-row__media']}
          expandedClassName={styles['timeline-row__frame']}
          videoClassName={styles['timeline-row__video']}
        />
      ) : <FrameGallery frames={frames} className={styles['timeline-row__media']} expandedClassName={styles['timeline-row__frame']} />}
    </li>
  );
}
