import { attachTab } from '@openuji/host-extension';
import { defineBackground } from 'wxt/utils/define-background';
import {
  JOURNEY_PORT,
  type PanelMessage,
  type TabSummary,
  type WorkerMessage,
} from '../lib/protocol';
import { Recorder } from '../lib/recorder';

/**
 * The service worker: wires Chrome to the `Recorder` and the `Recorder` to the
 * open panels. Everything that decides anything lives in `lib/`.
 */
export default defineBackground(() => {
  // Clicking the toolbar button opens the journey panel.
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  const panels = new Set<chrome.runtime.Port>();

  const broadcast = (message: WorkerMessage): void => {
    if (message.type === 'status' || message.type === 'snapshot') {
      console.info(`[recorder] ${message.status.state}`, message.status);
    }
    for (const port of panels) port.postMessage(message);
  };

  const recorder = new Recorder((tabId) => attachTab(chrome.debugger, tabId), broadcast);

  // Debug handle: chrome://extensions → "Inspect views: service worker", then
  // `recorder.status`, `recorder.captures`, `await recorder.cdp.send(...)`.
  // The browser tests drive the recorder through it too.
  Object.assign(globalThis, { recorder });

  const handle = async (message: PanelMessage): Promise<void> => {
    switch (message.type) {
      case 'record':
        return recorder.record(await describeTab(message.tabId));
      case 'stop':
        return recorder.stop();
      case 'reset':
        return recorder.reset();
    }
  };

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== JOURNEY_PORT) return;

    panels.add(port);
    port.onDisconnect.addListener(() => panels.delete(port));
    port.postMessage(recorder.snapshot());

    port.onMessage.addListener((message: PanelMessage) => {
      handle(message).catch((error: unknown) => {
        console.error('[recorder]', error);
        const reply: WorkerMessage = {
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        };
        port.postMessage(reply);
      });
    });
  });
});

async function describeTab(tabId: number): Promise<TabSummary> {
  const tab = await chrome.tabs.get(tabId);
  return { id: tabId, title: tab.title ?? '', url: tab.url ?? '' };
}
