import type { ReactNode } from 'react';
import type { EntryField, EntryStep, JourneyEntry } from '@openuji/journey';
import { useActiveSection } from '../../hooks/useActiveSection';
import { readerSections, type ReaderSection } from './reader-sections';
import styles from './ReaderDocument.module.css';
import { TagList } from '../TagList/TagList';
import { ReaderStep, type ReaderMedia } from './ReaderStep';

export type ReaderDocumentProps = Readonly<{
  entry: JourneyEntry;
  /** Where each archive file the entry names can be loaded from. */
  media: ReaderMedia;
}>;

/**
 * A journey as its readers see it: the contents beside the report, each
 * step's note before its pictures. Its only state is which section is being
 * read; the time-and-address toggles are the browser's own checkboxes.
 */
export function ReaderDocument({ entry, media }: ReaderDocumentProps) {
  const sections = readerSections(entry);
  const active = useActiveSection(sections.map((section) => section.id));

  return (
    <div className={styles['reader']}>
      {sections.length > 1 && <Contents sections={sections} active={active} />}
      <article className={styles['reader__document']}>
        <label className={styles['reader__details']}>
          <input type="checkbox" className={styles['reader__details-input']} />
          Show time & address
        </label>
        {sections.map((section) => <Section key={section.id} section={section} entry={entry} media={media} />)}
      </article>
    </div>
  );
}

/** Titles on a wide screen; on a narrow one, a ruler of stripes. */
function Contents({ sections, active }: { sections: readonly ReaderSection[]; active: string | null }) {
  return (
    <aside className={styles['reader__contents']}>
      <nav className={styles['reader__toc']} aria-label="Contents">
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

function Section({ section, entry, media }: { section: ReaderSection; entry: JourneyEntry; media: ReaderMedia }) {
  switch (section.kind) {
    case 'intro': return (
      <section id={section.id} className={styles['reader__intro']}>
        <TagList tags={entry.tags} />
        {section.fields.map((field) => <Field key={field.id} field={field} />)}
        <Steps steps={section.steps} media={media} />
      </section>
    );
    case 'phase': return (
      <section id={section.id} className={styles['reader__section']}>
        <h2 className={styles['reader__heading']}>{section.title}</h2>
        {section.phase.happened && <Statement label={entry.phaseWording.happened}>{section.phase.happened}</Statement>}
        {section.phase.problem && <Statement label={entry.phaseWording.problem}>{section.phase.problem}</Statement>}
        <Steps steps={section.steps} media={media} />
      </section>
    );
    case 'conclusion': return (
      <section id={section.id} className={styles['reader__section']}>
        <h2 className={styles['reader__heading']}>{section.title}</h2>
        {section.fields.map((field) => <Field key={field.id} field={field} />)}
      </section>
    );
  }
}

function Steps({ steps, media }: { steps: readonly EntryStep[]; media: ReaderMedia }) {
  return steps.length > 0 && (
    <ol className={styles['reader__steps']}>
      {steps.map((step) => <ReaderStep key={step.event.key} step={step} media={media} />)}
    </ol>
  );
}

function Field({ field }: { field: EntryField }) {
  switch (field.kind) {
    case 'title': return <h1 className={styles['reader__title']}>{field.text}</h1>;
    case 'statement': return <Statement label={field.label}>{field.text}</Statement>;
    case 'section': return (
      <div className={styles['reader__field']}>
        <h3 className={styles['reader__field-heading']}>{field.label}</h3>
        <p className={styles['reader__text']}>{field.text}</p>
      </div>
    );
  }
}

function Statement({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles['reader__statement']}>
      <span className={styles['reader__statement-label']}>{label}</span>
      <p className={styles['reader__text']}>{children}</p>
    </div>
  );
}
