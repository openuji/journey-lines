import { Clock } from 'lucide-react';
import { formatClock, mapEventMedia, shortUrl, type EntryStep, type FiledClip } from '@openuji/journey';
import type { PlayableClip } from '../../lib/playable-clip';
import { eventMedia, presentation, type PlayableEvent } from '../JourneyRow/JourneyRow';
import { StepMedia } from '../StepMedia/StepMedia';
import styles from './ReaderDocument.module.css';

/** Where each archive file the report shows can be loaded from. */
export type ReaderMedia = Readonly<Record<string, string>>;

const playableClip = (media: ReaderMedia) => (clip: FiledClip): PlayableClip | undefined => {
  const src = media[clip.file];
  return src === undefined ? undefined : { src, trace: clip.trace };
};

/**
 * A step as its reader meets it: what happened, then what the author says
 * about it, then the pictures. When and where it happened folds away behind
 * the step's own toggle, or the document's.
 */
export function ReaderStep({ step, media }: { step: EntryStep; media: ReaderMedia }) {
  const { event, note } = step;
  const { title, icon: Icon } = presentation(event);
  const playable: PlayableEvent = mapEventMedia(event, (file) => media[file], playableClip(media));
  const { frames, clip } = eventMedia(playable, title);

  return (
    <li className={styles['reader-step']} data-tone={event.kind}>
      <div className={styles['reader-step__head']}>
        <Icon className={styles['reader-step__icon']} strokeWidth={1.75} aria-hidden />
        <span className={styles['reader-step__title']} data-event-title>{title}</span>
        <label className={styles['reader-step__toggle']} title="Time and address">
          <input type="checkbox" className={styles['reader-step__toggle-input']} aria-label={`Time and address · ${title}`} />
          <Clock aria-hidden />
        </label>
      </div>
      <p className={styles['reader-step__meta']}>
        <time>{formatClock(event.atMs)}</time>
        <span title={event.url}>{shortUrl(event.url)}</span>
      </p>
      {note && <p className={styles['reader-step__note']}>{note}</p>}
      <StepMedia
        frames={frames}
        clip={clip}
        className={styles['reader-step__media']}
        expandedClassName={styles['reader-step__frame']}
        videoClassName={styles['reader-step__video']}
      />
    </li>
  );
}
