import { useTranslation } from '../../localisation/TranslationProvider';
import { formatClock, type OutlineStep, type ReportTemplate } from '@openuji/journey';
import { Button } from '../Button/Button';
import { EditableText } from '../EditableText/EditableText';
import { EventRow, presentation } from '../JourneyRow/JourneyRow';
import styles from './ReportDocument.module.css';
import type { ReportEdit } from './ReportDocument';

/** A step looks as it does in the side panel; the editor adds its note and its tools. */
export function ReportStep({ step, startsPhase, template, onEdit }: Readonly<{
  step: OutlineStep;
  /** Whether a phase already begins with this step. */
  startsPhase: boolean;
  template: ReportTemplate;
  onEdit: ReportEdit;
}>) {
  const { t } = useTranslation();
  const { event, hidden, note } = step;
  const title = presentation(event, t).title;
  const time = formatClock(event.atMs);

  if (hidden) {
    return (
      <li className={styles['report-step--hidden']}>
        <time className={styles['report-time']}>{time}</time>
        <span>{t('step.hidden')} · {title}</span>
        <Button variant="quiet" size="small" onClick={() => onEdit({ type: 'setStepHidden', at: event.key, hidden: false })}>
          {t('step.show')}
        </Button>
      </li>
    );
  }

  return (
    <EventRow event={event}>
      <div className={styles['report-step']}>
        <EditableText
          className={styles['report-step__note']}
          value={note}
          label={`${template.note.label} · ${title} ${time}`}
          placeholder={template.note.placeholder}
          editing
          onChange={(value) => onEdit({ type: 'setStepNote', at: event.key, note: value })}
        />
        <div className={styles['report-step__tools']}>
          {!startsPhase && (
            <Button variant="quiet" size="small" onClick={() => onEdit({ type: 'startPhase', at: event.key })}>
              {t('step.startPhase')}
            </Button>
          )}
          <Button variant="quiet" size="small" onClick={() => onEdit({ type: 'setStepHidden', at: event.key, hidden: true })}>
            {t('step.hide')}
          </Button>
        </div>
      </div>
    </EventRow>
  );
}
