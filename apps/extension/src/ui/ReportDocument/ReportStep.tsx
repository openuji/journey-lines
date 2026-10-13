import { formatClock } from '../../lib/journey';
import { isShown, type OutlineStep, type ReportAction, type ReportMode } from '../../lib/report-draft';
import type { ReportTemplate } from '../../lib/report-template';
import { Button } from '../Button/Button';
import { EditableText } from '../EditableText/EditableText';
import { EventRow, presentation } from '../JourneyRow/JourneyRow';
import styles from './ReportDocument.module.css';

/** A step looks as it does in the side panel; the report adds its note and, while editing, its tools. */
export function ReportStep({ step, startsPhase, mode, template, dispatch }: {
  step: OutlineStep;
  /** Whether a phase already begins with this step. */
  startsPhase: boolean;
  mode: ReportMode;
  template: ReportTemplate;
  dispatch: (action: ReportAction) => void;
}) {
  const { event, hidden, note } = step;
  const editing = mode === 'edit';
  const title = presentation(event).title;
  const time = formatClock(event.atMs);

  if (hidden) {
    return (
      <li className={styles['report-step--hidden']}>
        <time className={styles['report-time']}>{time}</time>
        <span>Hidden · {title}</span>
        <Button variant="quiet" size="small" onClick={() => dispatch({ type: 'setStepHidden', at: event.key, hidden: false })}>
          Show
        </Button>
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
            editing={editing}
            onChange={(value) => dispatch({ type: 'setStepNote', at: event.key, note: value })}
          />
          {editing && (
            <div className={styles['report-step__tools']}>
              {!startsPhase && (
                <Button variant="quiet" size="small" onClick={() => dispatch({ type: 'startPhase', at: event.key })}>
                  Start phase here
                </Button>
              )}
              <Button variant="quiet" size="small" onClick={() => dispatch({ type: 'setStepHidden', at: event.key, hidden: true })}>
                Hide
              </Button>
            </div>
          )}
        </div>
      )}
    </EventRow>
  );
}
