import { formatClock, isShown, type OutlineStep, type ReportMode, type ReportTemplate } from '@openuji/journey';
import { Button } from '../Button/Button';
import { EditableText } from '../EditableText/EditableText';
import { EventRow, presentation } from '../JourneyRow/JourneyRow';
import styles from './ReportDocument.module.css';
import type { ReportEdit } from './ReportDocument';

/** A step looks as it does in the side panel; the report adds its note and, while editing, its tools. */
export function ReportStep({ step, startsPhase, template, onEdit }: {
  step: OutlineStep;
  /** Whether a phase already begins with this step. */
  startsPhase: boolean;
  template: ReportTemplate;
  /** Present while the report is edited. */
  onEdit: ReportEdit | undefined;
}) {
  const { event, hidden, note } = step;
  const mode: ReportMode = onEdit ? 'edit' : 'preview';
  const title = presentation(event).title;
  const time = formatClock(event.atMs);

  // Only an editor's outline keeps hidden steps.
  if (hidden) {
    return (
      <li className={styles['report-step--hidden']}>
        <time className={styles['report-time']}>{time}</time>
        <span>Hidden · {title}</span>
        {onEdit && (
          <Button variant="quiet" size="small" onClick={() => onEdit({ type: 'setStepHidden', at: event.key, hidden: false })}>
            Show
          </Button>
        )}
      </li>
    );
  }

  return (
    <EventRow event={event}>
      {isShown(note, mode) && (
        <div className={styles['report-step']}>
          <EditableText
            className={styles['report-step__note']}
            value={note}
            label={`${template.note.label} · ${title} ${time}`}
            placeholder={template.note.placeholder}
            editing={onEdit !== undefined}
            onChange={onEdit && ((value) => onEdit({ type: 'setStepNote', at: event.key, note: value }))}
          />
          {onEdit && (
            <div className={styles['report-step__tools']}>
              {!startsPhase && (
                <Button variant="quiet" size="small" onClick={() => onEdit({ type: 'startPhase', at: event.key })}>
                  Start phase here
                </Button>
              )}
              <Button variant="quiet" size="small" onClick={() => onEdit({ type: 'setStepHidden', at: event.key, hidden: true })}>
                Hide
              </Button>
            </div>
          )}
        </div>
      )}
    </EventRow>
  );
}
