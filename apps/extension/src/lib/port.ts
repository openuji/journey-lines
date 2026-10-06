import { JOURNEY_PORT, type PanelMessage, type WorkerMessage } from './protocol';

/** The panel's end of the journey port. */
export interface JourneyPort {
  send(message: PanelMessage): void;
  close(): void;
}

/**
 * Connect to the service worker; the worker answers with a snapshot.
 *
 * Chrome stops a worker that has been idle for a while, and its in-memory
 * journey goes with it. The panel keeps showing what it has and reconnects
 * only when it next has something to send.
 */
export function connectJourney(onMessage: (message: WorkerMessage) => void): JourneyPort {
  const connect = (): chrome.runtime.Port => {
    const next = chrome.runtime.connect({ name: JOURNEY_PORT });
    next.onMessage.addListener(onMessage);
    next.onDisconnect.addListener(() => {
      if (port === next) port = null;
      // A worker that stopped going idle disconnects quietly. An error means
      // nothing answered: the worker failed to start, or runs code without the
      // journey listener.
      const failure = chrome.runtime.lastError;
      if (failure) {
        onMessage({
          type: 'error',
          message: `Cannot reach the recorder's service worker: ${failure.message}`,
        });
      }
    });
    return next;
  };

  let port: chrome.runtime.Port | null = connect();

  return {
    send(message) {
      port ??= connect();
      port.postMessage(message);
    },
    close() {
      port?.disconnect();
      port = null;
    },
  };
}
