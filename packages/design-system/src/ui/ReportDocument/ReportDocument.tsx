import { useMemo, type ReactNode } from 'react';
import {
  journeyTemplate,
  reportOutline,
  type FieldText,
  type JourneyEvent,
  type OutlinePhase,
  type OutlineStep,
  type ReportAction,
  type ReportDraft,
  type ReportTemplate,
  type TemplateField,
} from '@openuji/journey';
import { Button } from '../Button/Button';
import { EditableText } from '../EditableText/EditableText';
import styles from './ReportDocument.module.css';
import { ReportStep } from './ReportStep';
import { TagEditor } from '../TagEditor/TagEditor';

/** Receives every change while the report is edited. */
export type ReportEdit = (action: ReportAction) => void;

export type ReportDocumentProps = Readonly<{
  events: readonly JourneyEvent[];
  draft: ReportDraft;
  template?: ReportTemplate;
  /** Tags the researcher can add with one click. */
  tagSuggestions?: readonly string[];
  onEdit: ReportEdit;
}>;

/**
 * A recording being written up as a report: every template field around every
 * step, hidden ones included, grouped into phases. How it reads is the
 * reader's (`ReaderDocument`).
 */
export function ReportDocument({ events, draft, template = journeyTemplate, tagSuggestions, onEdit }: ReportDocumentProps) {
  const outline = useMemo(() => reportOutline(draft, events, 'edit'), [draft, events]);
  const field = (item: TemplateField) => (
    <Field
      key={item.id}
      field={item}
      value={draft.fields[item.id] ?? ''}
      onChange={(value) => onEdit({ type: 'setField', field: item.id, value })}
    />
  );
  const steps = (items: readonly OutlineStep[]) => items.length > 0 && (
    <ol className={styles['report-steps']}>
      {items.map((step) => (
        <ReportStep
          key={step.event.key}
          step={step}
          startsPhase={step.event.key in draft.phases}
          template={template}
          onEdit={onEdit}
        />
      ))}
    </ol>
  );

  return (
    <article className={styles['report-draft']}>
      <header className={styles['report-draft__head']}>
        <TagEditor
          tags={draft.tags}
          suggestions={tagSuggestions}
          wording={template.tags}
          onAdd={(tag) => onEdit({ type: 'addTag', tag })}
          onRemove={(tag) => onEdit({ type: 'removeTag', tag })}
        />
        {template.header.map(field)}
      </header>
      {events.length === 0 && <p className={styles['report-message']}>No steps were recorded.</p>}
      {steps(outline.lead)}
      {outline.phases.map((phase) => (
        <Phase key={phase.at} phase={phase} template={template} onEdit={onEdit}>
          {steps(phase.steps)}
        </Phase>
      ))}
      {template.closing.map(field)}
    </article>
  );
}

function Field({ field, value, onChange }: {
  field: TemplateField;
  value: string;
  onChange: (value: string) => void;
}) {
  const text = (as: 'p' | 'h1', className: string | undefined) => (
    <EditableText
      as={as}
      className={className}
      value={value}
      label={field.label}
      placeholder={field.placeholder}
      editing
      onChange={onChange}
    />
  );
  switch (field.kind) {
    case 'title': return text('h1', styles['report-draft__title']);
    case 'statement': return <Statement label={field.label}>{text('p', styles['report-text'])}</Statement>;
    case 'section': return (
      <section className={styles['report-section']}>
        <h2 className={styles['report-heading']}>{field.label}</h2>
        {text('p', styles['report-text'])}
      </section>
    );
  }
}

function Statement({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles['report-statement']}>
      <span className={styles['report-statement__label']}>{label}</span>
      {children}
    </div>
  );
}

function Phase({ phase, template, onEdit, children }: {
  phase: OutlinePhase;
  template: ReportTemplate;
  onEdit: ReportEdit;
  children: ReactNode;
}) {
  const { title = '', happened = '', problem = '' } = phase.text;
  const text = (field: 'title' | 'happened' | 'problem', value: string, wording: FieldText) => (
    <EditableText
      className={styles[field === 'title' ? 'report-phase__title' : 'report-text']}
      value={value}
      label={`${template.phase.name} ${phase.number} · ${wording.label}`}
      placeholder={wording.placeholder}
      editing
      onChange={(next) => onEdit({ type: 'setPhase', at: phase.at, field, value: next })}
    />
  );

  return (
    <section className={styles['report-phase']}>
      <div className={styles['report-phase__head']}>
        <h2 className={styles['report-heading']}>{template.phase.name} {phase.number}</h2>
        {text('title', title, template.phase.title)}
        <Button variant="quiet" size="small" onClick={() => onEdit({ type: 'removePhase', at: phase.at })}>
          Remove phase
        </Button>
      </div>
      <Statement label={template.phase.happened.label}>{text('happened', happened, template.phase.happened)}</Statement>
      <Statement label={template.phase.problem.label}>{text('problem', problem, template.phase.problem)}</Statement>
      {children}
    </section>
  );
}
