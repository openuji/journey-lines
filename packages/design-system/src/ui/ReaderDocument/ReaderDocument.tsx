import { useTranslation } from '../../localisation/TranslationProvider';
import { useEffect, useId, useRef, useState } from 'react';
import type { EntryStep, JourneyEntry } from '@journey-lines/journey';
import { useActiveSection } from '../../hooks/useActiveSection';
import { PhaseBadge } from '../PhaseBadge/PhaseBadge';
import { Statement } from '../Statement/Statement';
import { StepViewer } from '../StepViewer/StepViewer';
import type { ViewerAt, ViewerSlide, ViewerView } from '../StepViewer/step-viewer';
import { phaseFacts, phaseTitle, readerSections, type PhaseSection, type ReaderSection } from './reader-sections';
import { readerSlides, type ReaderMedia } from './reader-slides';
import styles from './ReaderDocument.module.css';
import { TagList } from '../TagList/TagList';
import { ReaderStep } from './ReaderStep';

export type ReaderDocumentProps = Readonly<{
  entry: JourneyEntry;
  /** Where each archive file the entry names can be loaded from. */
  media: ReaderMedia;
}>;

/** How a step's pictures reach the viewer: its slide, the way to open it there, and which step was viewed last. */
type Viewing = Readonly<{
  viewerId: string;
  slides: ReadonlyMap<string, Readonly<{ index: number; slide: ViewerSlide }>>;
  open: (at: ViewerAt) => void;
  viewedKey: string | null;
}>;

/**
 * A journey as its readers see it: what was wanted, what came of it and what
 * was learned first, with a map of the phases; then each phase, its steps as
 * a storyboard, every picture opening large in the viewer. Closing the viewer
 * lands on the step it showed last. Its state is which section is being read,
 * which step the viewer shows, and which it showed last.
 */
export function ReaderDocument({ entry, media }: ReaderDocumentProps) {
  const { t, language, dir } = useTranslation();
  const sections = readerSections(entry, t);
  const phases = sections.filter((section): section is PhaseSection => section.kind === 'phase');
  const active = useActiveSection(sections.map((section) => section.id));
  const slides = readerSlides(entry, sections, media, t, dir);
  const root = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<ViewerAt | null>(null);
  const [viewedKey, setViewedKey] = useState<string | null>(null);
  const viewerId = `step-viewer-${useId().replaceAll(':', '')}`;

  const view = (next: ViewerAt | null) => {
    setAt(next);
    const shown = next && slides[next.index];
    if (shown) setViewedKey(shown.key);
  };

  // Closed: back at the step last shown, its first picture focused.
  useEffect(() => {
    if (at !== null || viewedKey === null) return;
    const step = root.current?.querySelector<HTMLElement>(`[data-step-key="${CSS.escape(viewedKey)}"]`);
    step?.scrollIntoView({ block: 'center' });
    step?.querySelector<HTMLElement>(`button[aria-controls="${CSS.escape(viewerId)}"]`)?.focus({ preventScroll: true });
  }, [at, viewedKey, viewerId]);

  const viewing: Viewing = {
    viewerId,
    slides: new Map(slides.map((slide, index) => [slide.key, { index, slide }])),
    open: view,
    viewedKey,
  };

  return (
    <div ref={root} className={styles['reader']} lang={language} dir={dir}>
      {sections.length > 1 && <Contents sections={sections} active={active} />}
      <article className={styles['reader__document']}>
        {sections.map((section) => section.kind === 'overview'
          ? <Overview key={section.id} section={section} entry={entry} phases={phases} viewing={viewing} />
          : <Phase key={section.id} section={section} entry={entry} viewing={viewing} />)}
      </article>
      <StepViewer id={viewerId} slides={slides} at={at} onChange={view} />
    </div>
  );
}

/** Titles on a wide screen; on a narrow one, a ruler of stripes. */
function Contents({ sections, active }: { sections: readonly ReaderSection[]; active: string | null }) {
  const { t } = useTranslation();
  return (
    <aside className={styles['reader__contents']}>
      <nav className={styles['reader__toc']} aria-label={t('reader.contents')}>
        <ol>
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} aria-current={section.id === active ? 'location' : undefined}>
                <span className={styles['reader__toc-label']}>{section.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </aside>
  );
}

type OverviewSection = Extract<ReaderSection, { kind: 'overview' }>;

/** The report at a glance: its title, every written statement in template order, and the phases. */
function Overview({ section, entry, phases, viewing }: Readonly<{
  section: OverviewSection;
  entry: JourneyEntry;
  phases: readonly PhaseSection[];
  viewing: Viewing;
}>) {
  const titles = section.fields.filter((field) => field.kind === 'title');
  const facts = section.fields.filter((field) => field.kind !== 'title');
  return (
    <section id={section.id} className={styles['reader__overview']}>
      <TagList tags={entry.tags} />
      {titles.map((field) => <h1 key={field.id} className={styles['reader__title']}>{field.text}</h1>)}
      {facts.length > 0 && (
        <dl className={styles['reader__facts']}>
          {facts.map((field) => (
            <div key={field.id} className={styles['reader__fact']}>
              <dt className={styles['reader__fact-label']}>{field.label}</dt>
              <dd className={styles['reader__text']}>{field.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {phases.length > 1 && <PhaseMap entry={entry} phases={phases} />}
      <Steps steps={section.steps} viewing={viewing} />
    </section>
  );
}

/** One row per phase, as its header shows it: where it went, how long it took, and what went wrong. */
function PhaseMap({ entry, phases }: Readonly<{ entry: JourneyEntry; phases: readonly PhaseSection[] }>) {
  const { t, dir } = useTranslation();
  return (
    <div className={styles['reader__map']}>
      <h2 className={styles['reader__map-heading']}>{t('reader.phaseMap')}</h2>
      <ol className={styles['reader__map-list']}>
        {phases.map((section) => (
          <li key={section.id} className={styles['reader__map-phase']}>
            <PhaseBadge number={section.phase.number} name={entry.phaseWording.name} />
            <a href={`#${section.id}`} className={styles['reader__map-link']}>{phaseTitle(entry, section.phase)}</a>
            <span className={styles['reader__phase-meta']}>{phaseFacts(section, t, dir).join(' · ')}</span>
            {section.phase.problem && <span className={styles['reader__map-problem']}>{section.phase.problem}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A phase opens the way its row in the map reads: its number on the rail, its title, where and how long. */
function Phase({ section, entry, viewing }: Readonly<{ section: PhaseSection; entry: JourneyEntry; viewing: Viewing }>) {
  const { t, dir } = useTranslation();
  const { phase } = section;
  const facts = phaseFacts(section, t, dir);
  return (
    <section id={section.id} className={styles['reader__section']}>
      <header className={styles['reader__phase-head']}>
        <h2 className={styles['reader__heading']}>
          <PhaseBadge number={phase.number} name={entry.phaseWording.name} />
          <span>{phaseTitle(entry, phase)}</span>
        </h2>
        {facts.length > 0 && <p className={styles['reader__phase-meta']}>{facts.join(' · ')}</p>}
      </header>
      {phase.happened && <Statement label={entry.phaseWording.happened} className={styles['reader__happened']}>{phase.happened}</Statement>}
      {phase.problem && <Statement label={entry.phaseWording.problem} tone="problem" className={styles['reader__problem']}>{phase.problem}</Statement>}
      <Steps steps={section.steps} viewing={viewing} />
    </section>
  );
}

function Steps({ steps, viewing }: Readonly<{ steps: readonly EntryStep[]; viewing: Viewing }>) {
  return steps.length > 0 && (
    <ol className={styles['reader__steps']}>
      {steps.map((step) => {
        const shown = viewing.slides.get(step.event.key);
        return shown && (
          <ReaderStep
            key={step.event.key}
            step={step}
            slide={shown.slide}
            viewed={viewing.viewedKey === step.event.key}
            viewerId={viewing.viewerId}
            onOpen={(view: ViewerView) => viewing.open({ index: shown.index, view })}
          />
        );
      })}
    </ol>
  );
}
