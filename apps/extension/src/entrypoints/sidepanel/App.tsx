import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from '@journey-lines/design-system';
import { initialPanelState, panelReducer } from '../../lib/panel-state';
import { connectJourney, type JourneyPort } from '../../lib/port';
import type { PanelMessage } from '../../lib/protocol';
import { reportUrl } from '../../lib/report-protocol';
import { PanelView } from '../../ui/PanelView/PanelView';
import { defaultExtensionLanguage, loadExtensionLanguage } from '../../lib/settings';
import { ExtensionTranslationProvider } from '../../localisation/TranslationProvider';

export function App() {
  const [language, setLanguage] = useState(defaultExtensionLanguage);

  useEffect(() => {
    let active = true;
    void loadExtensionLanguage().then((language) => { if (active) setLanguage(language); });
    return () => { active = false; };
  }, []);

  return <ExtensionTranslationProvider language={language}><Panel /></ExtensionTranslationProvider>;
}

function Panel() {
  const [state, dispatch] = useReducer(panelReducer, initialPanelState);
  const send = useJourneyPort(dispatch);
  const { t, language, dir } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
    document.title = t('panel.title');
  }, [language, dir, t]);

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
