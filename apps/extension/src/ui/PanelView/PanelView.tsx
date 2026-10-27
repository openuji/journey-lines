import { useMemo } from 'react';
import { journeyEvents } from '@journey-lines/journey';
import { Alert, IconButton, useTranslation } from '@journey-lines/design-system';
import { Settings as SettingsIcon } from 'lucide-react';
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
  onOpenSettings,
}: {
  state: PanelState;
  onRecord: (tabId: number, options: {video: boolean}) => void;
  onStop: () => void;
  onReset: () => void;
  onOpenReport: (sessionId: string) => void;
  onDismissError: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const { connected, status, captures, error, clips } = state;
  const startedAtMs = status.state === 'idle' ? 0 : status.startedAtMs;
  const events = useMemo(() => journeyEvents(captures, startedAtMs, clips), [captures, startedAtMs, clips]);

  return (
    <main className={styles['panel']}>
      <nav className={styles['toolbar']} aria-label={t('panel.navigation')}>
        <IconButton label={t('panel.settings')} title={t('panel.settings')} onClick={onOpenSettings}>
          <SettingsIcon aria-hidden="true" />
        </IconButton>
      </nav>
      {error && <Alert onDismiss={onDismissError}>{error}</Alert>}

      {!connected && !error && <p className={styles['hint']} role="status">{t('panel.connecting')}</p>}

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
