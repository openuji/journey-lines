import { useMemo } from 'react';
import { journeyEvents } from '@openuji/journey';
import { Alert } from '@openuji/design-system';
import type { PanelState } from '../../lib/panel-state';
import { Done } from '../Done/Done';
import { Idle } from '../Idle/Idle';
import { Recording } from '../Recording/Recording';
import styles from './PanelView.module.css';

export function PanelView({
  state,
  onRecord,
  onStop,
  onReset,
  onOpenReport,
  onDismissError,
}: {
  state: PanelState;
  onRecord: (tabId: number, options: {video: boolean}) => void;
  onStop: () => void;
  onReset: () => void;
  onOpenReport: (sessionId: string) => void;
  onDismissError: () => void;
}) {
  const { connected, status, captures, error, clips } = state;
  const startedAtMs = status.state === 'idle' ? 0 : status.startedAtMs;
  const events = useMemo(() => journeyEvents(captures, startedAtMs, clips), [captures, startedAtMs, clips]);

  return (
    <main className={styles['panel']}>
      {error && <Alert onDismiss={onDismissError}>{error}</Alert>}

      {!connected && !error && <p className={styles['hint']}>Connecting to the recorder…</p>}

      {connected && status.state === 'idle' && (
        <Idle
          failed={error !== null}
          onRecord={onRecord}
        />
      )}
      {connected && (status.state === 'recording' || status.state === 'stopping') && (
        <Recording
          status={status}
          events={events}
          onStop={onStop}
        />
      )}
      {connected && status.state === 'done' && (
        <Done
          status={status}
          events={events}
          onReset={onReset}
          onOpenReport={onOpenReport}
        />
      )}
    </main>
  );
}
