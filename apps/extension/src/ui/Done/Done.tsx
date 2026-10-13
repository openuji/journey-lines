import { formatClock, shortUrl, type EndedBy, type JourneyEvent } from '@openuji/journey';
import { Button } from '@openuji/design-system';
import type { RecorderStatus } from '../../lib/protocol';
import { Journey } from '../Journey/Journey';
import styles from './Done.module.css';

type Finished = Extract<RecorderStatus, { state: 'done' }>;

const endedNote: Record<EndedBy, string | null> = {
  user: null,
  'window-closed': 'The recording ended because its window was closed.',
  'debugging-cancelled': 'The recording ended because debugging was cancelled in Chrome.',
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
  const views = events.filter((event) => event.kind === 'page').length;
  const note = endedNote[status.endedBy];

  return (
    <>
      <header className={styles['done-header']}>
        <Button size="small" onClick={onReset}>
          Done
        </Button>
        <span className={styles['done-header__title']} title={status.tab.url}>
          {status.tab.title || shortUrl(status.tab.url)}
        </span>
        {status.sessionId && (
          <Button className={styles['open-report-button']} size="small" onClick={() => onOpenReport(status.sessionId!)}>Open report</Button>
        )}
      </header>

      <dl className={styles['summary']}>
        <div>
          <dt>Duration</dt>
          <dd>{formatClock(status.endedAtMs - status.startedAtMs)}</dd>
        </div>
        <div>
          <dt>Views</dt>
          <dd>{views}</dd>
        </div>
        <div>
          <dt>Events</dt>
          <dd>{events.length}</dd>
        </div>
        {status.droppedFrames > 0 && (
          <div>
            <dt>Dropped frames</dt>
            <dd>{status.droppedFrames}</dd>
          </div>
        )}
      </dl>

      {note && <p className={styles['note']}>{note}</p>}

      <Journey events={events} />
    </>
  );
}
