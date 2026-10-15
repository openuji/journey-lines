import { useEffect, useState } from 'react';
import { Square } from 'lucide-react';
import { formatClock, shortUrl, type JourneyEvent } from '@openuji/journey';
import type { ActiveTabState } from '@openuji/fused';
import { Button, StatusBadge, useTranslation } from '@openuji/design-system';
import type { RecorderStatus } from '../../lib/protocol';
import { Journey } from '../Journey/Journey';
import styles from './Recording.module.css';

/** What to say about the active tab when it is not being recorded. */
const activeNote: Record<ActiveTabState, string | null> = {
  recording: null,
  attaching: 'recording.waitingForPage',
  refused: 'recording.refused',
};

type Live = Extract<RecorderStatus, { state: 'recording' | 'stopping' }>;

export function Recording({
  status,
  events,
  onStop,
}: {
  status: Live;
  events: readonly JourneyEvent[];
  onStop: () => void;
}) {
  const { t } = useTranslation();
  const stopping = status.state === 'stopping';
  const note = activeNote[status.active.state];

  return (
    <>
      <header className={styles['recording-header']}>
        <StatusBadge tone={stopping ? 'neutral' : 'live'}>
          {t(stopping ? 'recording.finishing' : 'recording.live')}
        </StatusBadge>
        <ElapsedClock startedAtMs={status.startedAtMs} />
        <Button className={styles['stop-button']} size="small" disabled={stopping} onClick={onStop}>
          <Square fill="currentColor" />
          {t('recording.stop')}
        </Button>
      </header>

      <div className={styles['tab-chip']} title={status.active.tab.url}>
        <span className={styles['tab-chip__dot']} aria-hidden />
        {status.active.tab.title || shortUrl(status.active.tab.url)}
      </div>
      {note && <p className={styles['note']}>{t(note)}</p>}

      <Journey events={events} follow />
    </>
  );
}

/** Kept separate so its half-second tick does not rerender the journey. */
function ElapsedClock({ startedAtMs }: { startedAtMs: number }) {
  const now = useNow(500);
  return <span className={styles['clock']}>{formatClock(now - startedAtMs)}</span>;
}

/** The current time, refreshed every `intervalMs`. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
