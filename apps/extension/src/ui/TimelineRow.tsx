import type { LucideIcon } from 'lucide-react';
import type { Clip } from '@openuji/core';
import { FrameGallery, type GalleryFrame } from './FrameGallery';
import { TransitionMedia } from './TransitionMedia';

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
    <li className={`timeline-row timeline-row--${tone}`}>
      <time className="timeline-row__time">{time}</time>
      <Icon className="timeline-row__icon" size={16} strokeWidth={1.75} aria-hidden />
      <div className="timeline-row__heading">
        <span className="timeline-row__label">{title}</span>
        {subtitle && <span className="timeline-row__subtitle" title={subtitle.title}>{subtitle.text}</span>}
      </div>
      {frames.length > 1 ? (
        <TransitionMedia
          frames={frames}
          clip={clip}
          className="timeline-row__media timeline-row__media--transition"
          expandedClassName="timeline-row__frame"
          videoClassName="timeline-row__video"
        />
      ) : <FrameGallery frames={frames} className="timeline-row__media" expandedClassName="timeline-row__frame" />}
    </li>
  );
}
