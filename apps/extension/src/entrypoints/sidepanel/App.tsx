import { useCallback, useEffect, useReducer, useRef } from 'react';
import { X } from 'lucide-react';
import { initialPanelState, panelReducer } from '../../lib/panel-state';
import { connectJourney, type JourneyPort } from '../../lib/port';
import type { PanelMessage } from '../../lib/protocol';
import { Done } from './Done';
import { Idle } from './Idle';
import { Recording } from './Recording';

export function App() {
  const [state, dispatch] = useReducer(panelReducer, initialPanelState);
  const send = useJourneyPort(dispatch);
  const { connected, status, captures, error } = state;

  return (
    <main className="panel">
      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          <button
            className="icon-button"
            aria-label="Dismiss"
            onClick={() => dispatch({ type: 'dismiss-error' })}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {!connected && !error && <p className="hint">Connecting to the recorder…</p>}

      {connected && status.state === 'idle' && (
        <Idle failed={error !== null} onRecord={(tabId) => send({ type: 'record', tabId })} />
      )}
      {connected && (status.state === 'recording' || status.state === 'stopping') && (
        <Recording status={status} captures={captures} onStop={() => send({ type: 'stop' })} />
      )}
      {connected && status.state === 'done' && (
        <Done status={status} captures={captures} onReset={() => send({ type: 'reset' })} />
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
