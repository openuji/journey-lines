import type { EntryStep } from '@journey-lines/journey';
import type { ViewerSlide, ViewerView } from '../StepViewer/step-viewer';
import { ReaderStepMedia } from './ReaderStepMedia';
import styles from './ReaderDocument.module.css';

export type { ReaderMedia } from './reader-slides';

/**
 * A step as its reader meets it, on the rail of its phase: what happened,
 * then what the author says about it, with its pictures beside the note where
 * there is room. When and where it happened is the viewer's to show.
 */
export function ReaderStep({ step, slide, viewed, viewerId, onOpen }: Readonly<{
  step: EntryStep;
  slide: ViewerSlide;
  /** The step the viewer showed last: ringed while it holds the focus the viewer hands back, so the reader finds their place. */
  viewed: boolean;
  viewerId: string;
  onOpen: (view: ViewerView) => void;
}>) {
  const { icon: Icon } = slide;

  return (
    <li className={styles['reader-step']} data-tone={step.event.kind} data-step-key={step.event.key} data-viewed={viewed || undefined}>
      <span className={styles['reader-step__marker']}>
        <Icon className={styles['reader-step__icon']} strokeWidth={1.75} aria-hidden />
      </span>
      <p className={styles['reader-step__title']} data-event-title>{slide.title}</p>
      {slide.note && <p className={styles['reader-step__note']}>{slide.note}</p>}
      <ReaderStepMedia slide={slide} viewerId={viewerId} onOpen={onOpen} />
    </li>
  );
}
