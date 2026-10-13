import { useMemo, type ReactNode } from 'react';
import type { JourneyEvent } from '../../lib/journey-events';
import {
  isShown,
  reportOutline,
  type OutlinePhase,
  type OutlineStep,
  type ReportAction,
  type ReportDraft,
  type ReportMode,
} from '../../lib/report-draft';
import { journeyTemplate, type FieldText, type ReportTemplate, type TemplateField } from '../../lib/report-template';
import { Button } from '../Button/Button';
import { EditableText } from '../EditableText/EditableText';
import styles from './ReportDocument.module.css';
import { ReportStep } from './ReportStep';

export type ReportDocumentProps = Readonly<{
  events: readonly JourneyEvent[];
  draft: ReportDraft;
  mode: ReportMode;
  dispatch: (action: ReportAction) => void;
  template?: ReportTemplate;
}>;

/** A recording told as a report: the template's fields around the steps, grouped into phases. */
export function ReportDocument({ events, draft, mode, dispatch, template = journeyTemplate }: ReportDocumentProps) {
  const outline = useMemo(() => reportOutline(draft, events, mode), [draft, events, mode]);
  const field = (item: TemplateField) => (
    <Field
      key={item.id}
      field={item}
      value={draft.fields[item.id] ?? ''}
      mode={mode}
      onChange={(value) => dispatch({ type: 'setField', field: item.id, value })}
    />
  );
  const steps = (items: readonly OutlineStep[]) => items.length > 0 && (
    <ol className={styles['report-steps']}>
      {items.map((step) => (
        <ReportStep
          key={step.event.key}
          step={step}
          startsPhase={step.event.key in draft.phases}
          mode={mode}
          template={template}
          dispatch={dispatch}
        />
      ))}
    </ol>
  );

  return (
    <article className={styles['report-draft']}>
      <header className={styles['report-draft__head']}>{template.header.map(field)}</header>
      {events.length === 0 && <p className={styles['report-message']}>No steps were recorded.</p>}
      {steps(outline.lead)}
      {outline.phases.map((phase) => (
        <Phase key={phase.at} phase={phase} mode={mode} template={template} dispatch={dispatch}>
          {steps(phase.steps)}
        </Phase>
      ))}
      {template.closing.map(field)}
    </article>
  );
}

function Field({ field, value, mode, onChange }: {
  field: TemplateField;
  value: string;
  mode: ReportMode;
  onChange: (value: string) => void;
}) {
  if (!isShown(value, mode)) return null;
  const text = (as: 'p' | 'h1', className: string | undefined) => (
    <EditableText
      as={as}
      className={className}
      value={value}
      label={field.label}
      placeholder={field.placeholder}
      editing={mode === 'edit'}
      onChange={onChange}
    />
  );
  switch (field.kind) {
    case 'subject': return text('p', styles['report-draft__subject']);
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

function Phase({ phase, mode, template, dispatch, children }: {
  phase: OutlinePhase;
  mode: ReportMode;
  template: ReportTemplate;
  dispatch: (action: ReportAction) => void;
  children: ReactNode;
}) {
  const editing = mode === 'edit';
  const { title = '', happened = '', problem = '' } = phase.text;
  const text = (field: 'title' | 'happened' | 'problem', value: string, wording: FieldText) => (
    <EditableText
      className={styles[field === 'title' ? 'report-phase__title' : 'report-text']}
      value={value}
      label={`${template.phase.name} ${phase.number} · ${wording.label}`}
      placeholder={wording.placeholder}
      editing={editing}
      onChange={(next) => dispatch({ type: 'setPhase', at: phase.at, field, value: next })}
    />
  );

  return (
    <section className={styles['report-phase']}>
      <div className={styles['report-phase__head']}>
        <h2 className={styles['report-heading']}>
          {template.phase.name} {phase.number}{!editing && title.trim() && ` — ${title}`}
        </h2>
        {editing && text('title', title, template.phase.title)}
        {editing && (
          <Button variant="quiet" size="small" onClick={() => dispatch({ type: 'removePhase', at: phase.at })}>
            Remove phase
          </Button>
        )}
      </div>
      {isShown(happened, mode) && <Statement label={template.phase.happened.label}>{text('happened', happened, template.phase.happened)}</Statement>}
      {isShown(problem, mode) && <Statement label={template.phase.problem.label}>{text('problem', problem, template.phase.problem)}</Statement>}
      {children}
    </section>
  );
}
