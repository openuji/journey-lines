import { useTranslation } from '../../localisation/TranslationProvider';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react';
import { shortUrl } from '@openuji/journey';
import { Button } from '../Button/Button';
import { IconButton } from '../IconButton/IconButton';
import { PhaseBadge } from '../PhaseBadge/PhaseBadge';
import { StatementTabs } from '../StatementTabs/StatementTabs';
import { clipDurationMs, frameTimeLabel } from '../ClipFilmstrip/clip-filmstrip';
import { defaultView, slideViews, viewFrame, type ViewerAt, type ViewerSlide, type ViewerView } from './step-viewer';
import styles from './StepViewer.module.css';

export type StepViewerProps = Readonly<{
  /** What the steps' pictures point at when they open it. */
  id: string;
  slides: readonly ViewerSlide[];
  /** The open slide and how it is looked at; nothing when closed. */
  at: ViewerAt | null;
  onChange: (at: ViewerAt | null) => void;
}>;

/**
 * Steps shown large, one at a time: over them the phase they belong to, its
 * headline beside the labels of what happened in it and its problem, a label
 * pointed at a tab showing its text over the screen; on either side of the
 * screen the way to the previous and next step; under it the ways to look at
 * the step, then the step and its note. Every picture and clip fills the same
 * screen, and what is over and under it has fixed room, so moving between
 * views and steps moves nothing else. Which step is open belongs to its host.
 */
export function StepViewer({ id, slides, at, onChange }: StepViewerProps) {
  const { t, dir } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const slide = at ? slides[at.index] : undefined;
  const open = slide !== undefined;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      element.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  const step = (delta: number) => {
    const index = (at?.index ?? 0) + delta;
    const next = slides[index];
    if (at && next) onChange({ index, view: defaultView(next) });
  };

  // The arrows step from anywhere in the viewer, the clip included, and hand the focus back to the
  // viewer itself: a view button the step removes would otherwise drop it outside, where no key reaches.
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === forward) step(1);
    else if (event.key === backward) step(-1);
    else return;
    event.preventDefault();
    dialog.current?.focus();
  };

  const show = (view: ViewerView) => {
    if (at?.view === 'video' && view === 'video' && video.current) {
      video.current.currentTime = 0;
      void video.current.play();
    } else if (at) {
      onChange({ index: at.index, view });
    }
  };

  const position = at ? t('viewer.position', { index: at.index + 1, count: slides.length }) : '';
  const Previous = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const Next = dir === 'rtl' ? ChevronLeft : ChevronRight;
  const Icon = slide?.icon;

  return (
    <dialog
      ref={dialog}
      id={id}
      className={styles['step-viewer']}
      tabIndex={-1}
      aria-label={slide ? [slide.phase?.title, slide.title, position].filter(Boolean).join(' · ') : undefined}
      onClose={() => onChange(null)}
      onKeyDown={onKeyDown}
    >
      {slide && at && Icon && (
        <div className={styles['step-viewer__layout']}>
          <header className={styles['step-viewer__bar']}>
            {slide.phase && (
              <div className={styles['step-viewer__phase']}>
                <PhaseBadge number={slide.phase.number} name={slide.phase.name} />
                <div className={styles['step-viewer__phase-heading']}>
                  <div className={styles['step-viewer__headline']}>
                    <p className={styles['step-viewer__phase-title']}>{slide.phase.title}</p>
                    {slide.phase.statements.length > 0 && (
                      <StatementTabs items={slide.phase.statements} className={styles['step-viewer__statements']} />
                    )}
                  </div>
                  {slide.phase.facts && <p className={styles['step-viewer__phase-facts']}>{slide.phase.facts}</p>}
                </div>
              </div>
            )}
            <p className={styles['step-viewer__position']}>{position}</p>
            <IconButton label={t('viewer.close')} onClick={() => onChange(null)}>
              <X aria-hidden />
            </IconButton>
          </header>

          <div className={styles['step-viewer__stage']}>
            <div className={styles['step-viewer__board']}>
              <IconButton
                label={t('viewer.previous')}
                size="default"
                className={styles['step-viewer__previous']}
                disabled={at.index === 0}
                onClick={() => step(-1)}
              >
                <Previous aria-hidden />
              </IconButton>
              <div className={styles['step-viewer__screen']}>
                {at.view === 'video' && slide.clip
                  ? <video ref={video} key={slide.key} className={styles['step-viewer__media']} src={slide.clip.src} controls muted playsInline autoPlay />
                  : <Picture slide={slide} view={at.view} />}
              </div>
              <IconButton
                label={t('viewer.next')}
                size="default"
                className={styles['step-viewer__next']}
                disabled={at.index === slides.length - 1}
                onClick={() => step(1)}
              >
                <Next aria-hidden />
              </IconButton>
              {slideViews(slide).length > 1 && (
                <div className={styles['step-viewer__views']} role="group">
                  {slideViews(slide).map((view) => (
                    <Button key={view} size="small" aria-pressed={at.view === view} onClick={() => show(view)}>
                      {view === 'video' && <Play className={styles['step-viewer__view-icon']} aria-hidden />}
                      {viewLabel(slide, view, t)}
                    </Button>
                  ))}
                </div>
              )}
              <section className={styles['step-viewer__step']}>
                <header className={styles['step-viewer__step-head']}>
                  <h2 className={styles['step-viewer__step-title']}>
                    <Icon className={styles['step-viewer__step-icon']} strokeWidth={1.75} aria-hidden />
                    {slide.title}
                  </h2>
                  <p className={styles['step-viewer__meta']}>
                    <time>{slide.time}</time> · <span dir="ltr" title={slide.url}>{shortUrl(slide.url)}</span>
                  </p>
                </header>
                {slide.note && <p className={styles['step-viewer__note']}>{slide.note}</p>}
              </section>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}

function Picture({ slide, view }: Readonly<{ slide: ViewerSlide; view: ViewerView }>) {
  const { t } = useTranslation();
  const frame = viewFrame(slide, view);
  return frame?.src
    ? <img className={styles['step-viewer__media']} src={frame.src} alt={t('media.frameAlt', { label: frame.label })} />
    : <span className={styles['step-viewer__unavailable']}>{t('media.unavailable')}</span>;
}

function viewLabel(slide: ViewerSlide, view: ViewerView, t: (key: string) => string): string {
  switch (view) {
    case 'before': return t('media.before');
    case 'after': return t('media.after');
    case 'video': return slide.clip ? `${t('viewer.video')} ${frameTimeLabel(clipDurationMs(slide.clip.trace))}` : t('viewer.video');
    case 'frame': return slide.title;
  }
}
