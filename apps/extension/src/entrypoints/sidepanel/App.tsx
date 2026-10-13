import { useCallback, useEffect, useReducer, useRef } from 'react';
import { initialPanelState, panelReducer } from '../../lib/panel-state';
import { connectJourney, type JourneyPort } from '../../lib/port';
import type { PanelMessage } from '../../lib/protocol';
import { reportUrl } from '../../lib/report-protocol';
import { PanelView } from '../../ui/PanelView/PanelView';

export function App() {
  const [state, dispatch] = useReducer(panelReducer, initialPanelState);
  const send = useJourneyPort(dispatch);

  return (
    <PanelView
      state={state}
      onRecord={(tabId, options) => send({ type: 'record', tabId, options })}
      onStop={() => send({ type: 'stop' })}
      onReset={() => send({ type: 'reset' })}
      onOpenReport={(sessionId) => void chrome.tabs.create({ url: reportUrl(sessionId) })}
      onDismissError={() => dispatch({ type: 'dismiss-error' })}
    />
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
