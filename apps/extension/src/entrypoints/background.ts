import { extensionTabs } from '@journey-lines/host-extension';
import { recordActiveTab } from '@journey-lines/fused';
import type { TabSummary } from '@journey-lines/journey';
import { createPrivacy } from '@journey-lines/privacy';
import { defineBackground } from 'wxt/utils/define-background';
import { setActionIcon } from '../lib/action-icon';
import { openClips } from '../lib/clips';
import { JOURNEY_PORT, type PanelMessage, type WorkerMessage } from '../lib/protocol';
import { Recorder } from '../lib/recorder';
import { MemoryRecordingStore } from '../lib/recording-store';
import { loadSettings, loadPrivacyProfile } from '../lib/settings';
import { REPORT_PORT, reportUrl, type ReportRequest, type ReportResponse } from '../lib/report-protocol';

/**
 * The service worker: wires Chrome to the `Recorder` and the `Recorder` to the
 * open panels. Everything that decides anything lives in `lib/`.
 */
export default defineBackground(() => {
  // Clicking the toolbar button opens the journey panel.
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  const panels = new Set<chrome.runtime.Port>();
  const store = new MemoryRecordingStore();

  const broadcast = (message: WorkerMessage): void => {
    if (message.type === 'status' || message.type === 'snapshot') {
      console.info(`[recorder] ${message.status.state}`, message.status);
    }
    for (const port of panels) {
      try { port.postMessage(message); } catch { panels.delete(port); }
    }
    if (message.type === 'status' && message.status.state === 'done' && message.status.sessionId) {
      void chrome.tabs.create({ url: reportUrl(message.status.sessionId) }).catch((error: unknown) => {
        console.error('[report] Could not open report tab', error);
      });
    }
  };

  const recorder = new Recorder(
    (windowId) => extensionTabs(chrome, windowId),
    describeTab,
    broadcast,
    openClips,
    store,
    undefined,
    async (tab) => {
      const settings = await loadSettings();
      const privacy = createPrivacy(await loadPrivacyProfile(settings));
      return {
        videoScale: settings.video.scale,
        tab: privacy.sanitizeLocation(tab),
        describeTab: async (id) => privacy.sanitizeLocation(await describeTab(id)),
        recordUsing: (host, active, options) => recordActiveTab(privacy.wrapHost(host), active, {
          ...options,
          click: settings.click,
          sinks: options.sinks.map((sink) => privacy.wrapCaptureSink(sink)),
          ...(options.clips ? { clips: privacy.wrapClipSink(options.clips) } : {}),
        }),
      };
    },
  );

  // Debug handle: chrome://extensions → "Inspect views: service worker", then
  // `recorder.status`, `recorder.captures`, `await recorder.cdp.send(...)`.
  // The browser tests drive the recorder through it too.
  Object.assign(globalThis, { recorder });

  const handle = async (message: PanelMessage): Promise<void> => {
    switch (message.type) {
      case 'record':
        return recorder.record(await describeTab(message.tabId), message.options);
      case 'stop':
        return recorder.stop();
      case 'reset':
        return recorder.reset();
    }
  };

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === REPORT_PORT) {
      port.onMessage.addListener((message: ReportRequest) => {
        void (async () => {
          const session = await store.get(message.sessionId);
          let reply: ReportResponse;
          if (!session) reply = { type: 'error', message: 'Recording unavailable.' };
          else if (message.type === 'get') {
            reply = { type: 'summary', meta: session.meta, total: session.items.length };
          } else if (!Number.isSafeInteger(message.index) || message.index < 0 || message.index >= session.items.length) {
            reply = { type: 'error', message: 'Recording item unavailable.' };
          } else {
            reply = { type: 'item', index: message.index, item: session.items[message.index]! };
          }
          port.postMessage(reply);
        })().catch((error: unknown) => {
          try { port.postMessage({ type: 'error', message: String(error) } satisfies ReportResponse); } catch { /* tab closed */ }
        });
      });
      return;
    }
    if (port.name !== JOURNEY_PORT) return;

    panels.add(port);
    if (panels.size === 1) updateActionIcon(true);
    port.onDisconnect.addListener(() => {
      panels.delete(port);
      if (panels.size === 0) updateActionIcon(false);
    });
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

function updateActionIcon(open: boolean): void {
  void setActionIcon(open).catch((error: unknown) => {
    console.error('[action] Could not update extension icon', error);
  });
}

async function describeTab(tabId: number): Promise<TabSummary> {
  const tab = await chrome.tabs.get(tabId);
  return { id: tabId, windowId: tab.windowId, title: tab.title ?? '', url: tab.url ?? '' };
}
