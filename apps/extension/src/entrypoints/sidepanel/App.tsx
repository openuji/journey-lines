import { useCallback, useEffect, useReducer, useRef } from 'react';
import { initialPanelState, panelReducer } from '../../lib/panel-state';
import { connectJourney, type JourneyPort } from '../../lib/port';
import type { PanelMessage } from '../../lib/protocol';
import { Alert } from '../../ui/Alert';
import { Done } from './Done';
import { Idle } from './Idle';
import { Recording } from './Recording';

export function App() {
  const [state, dispatch] = useReducer(panelReducer, initialPanelState);
  const send = useJourneyPort(dispatch);

  return (
    <PanelView
      state={state}
      onRecord={(tabId, options) => send({ type: 'record', tabId, options })}
      onStop={() => send({ type: 'stop' })}
      onReset={() => send({ type: 'reset' })}
      onDismissError={() => dispatch({ type: 'dismiss-error' })}
    />
  );
}

export function PanelView({
  state,
  onRecord,
  onStop,
  onReset,
  onDismissError,
}: {
  state: typeof initialPanelState;
  onRecord: (tabId: number, options: {video: boolean}) => void;
  onStop: () => void;
  onReset: () => void;
  onDismissError: () => void;
}) {
  const { connected, status, captures, error, clips } = state;

  return (
    <main className="panel">
      {error && <Alert onDismiss={onDismissError}>{error}</Alert>}

      {!connected && !error && <p className="hint">Connecting to the recorder…</p>}

      {connected && status.state === 'idle' && (
        <Idle
          failed={error !== null}
          onRecord={onRecord}
        />
      )}
      {connected && (status.state === 'recording' || status.state === 'stopping') && (
        <Recording
          status={status}
          captures={captures}
          clips={clips}
          onStop={onStop}
        />
      )}
      {connected && status.state === 'done' && (
        <Done
          status={status}
          captures={captures}
          clips={clips}
          onReset={onReset}
        />
      )}
    </main>
  );
}

/** One port to the worker for the panel's lifetime; its messages feed the reducer. */
function useJourneyPort(
  onMessage: Parameters<typeof connectJourney>[0],
): (message: PanelMessage) => void {
  const port = useRef<JourneyPort | null>(null);

  useEffect(() => {
    port.current = connectJourney(onMessage);
    return () => port.current?.close();
  }, [onMessage]);

  return useCallback((message: PanelMessage) => port.current?.send(message), []);
}
