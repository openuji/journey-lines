import { formatClock, shortUrl, type EndedBy, type JourneyEvent } from '@openuji/journey';
import { Button, useTranslation } from '@openuji/design-system';
import type { RecorderStatus } from '../../lib/protocol';
import { Journey } from '../Journey/Journey';
import styles from './Done.module.css';

type Finished = Extract<RecorderStatus, { state: 'done' }>;

const endedNote: Record<EndedBy, string | null> = {
  user: null,
  'window-closed': 'done.windowClosed',
  'debugging-cancelled': 'done.debuggingCancelled',
};

export function Done({
  status,
  events,
  onReset,
  onOpenReport,
}: {
  status: Finished;
  events: readonly JourneyEvent[];
  onReset: () => void;
  onOpenReport: (sessionId: string) => void;
}) {
  const { t } = useTranslation();
  const views = events.filter((event) => event.kind === 'page').length;
  const note = endedNote[status.endedBy];

  return (
    <>
      <header className={styles['done-header']}>
        <Button size="small" onClick={onReset}>
          {t('done.done')}
        </Button>
        <span className={styles['done-header__title']} title={status.tab.url}>
          {status.tab.title || shortUrl(status.tab.url)}
        </span>
        {status.sessionId && (
          <Button className={styles['open-report-button']} size="small" onClick={() => onOpenReport(status.sessionId!)}>{t('done.openReport')}</Button>
        )}
      </header>

      <dl className={styles['summary']}>
        <div>
          <dt>{t('done.duration')}</dt>
          <dd>{formatClock(status.endedAtMs - status.startedAtMs)}</dd>
        </div>
        <div>
          <dt>{t('done.views')}</dt>
          <dd>{views}</dd>
        </div>
        <div>
          <dt>{t('done.events')}</dt>
          <dd>{events.length}</dd>
        </div>
        {status.droppedFrames > 0 && (
          <div>
            <dt>{t('done.droppedFrames')}</dt>
            <dd>{status.droppedFrames}</dd>
          </div>
        )}
      </dl>

      {note && <p className={styles['note']}>{t(note)}</p>}

      <Journey events={events} />
    </>
  );
}
