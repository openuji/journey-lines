import type { Clip } from '@openuji/core';
import { clipSinkOver, type ClipWorker, type FromEncoder, type ToEncoder } from '@openuji/clip-webm';
import { extensionTabs } from '@openuji/host-extension';
import { defineBackground } from 'wxt/utils/define-background';
import { setActionIcon } from '../lib/action-icon';
import { CLIPS_READY, clipChannel, type ClipsReady } from '../lib/clips';
import {
  JOURNEY_PORT,
  type PanelMessage,
  type TabSummary,
  type WorkerMessage,
} from '../lib/protocol';
import { Recorder } from '../lib/recorder';
import { MemoryRecordingStore } from '../lib/recording-store';
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

/**
 * The video encoder for one recording: an offscreen document starts it in a
 * worker, and the clip sink's recorder side talks to it over the clip channel.
 * `close` ends both.
 */
async function openClips(onClip: (clip: Clip) => void): Promise<ClipWorker> {
  // A document left over from a recording the worker did not see end.
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();

  const ready = new Promise<void>((resolve, reject) => {
    const settle = (error?: string): void => {
      chrome.runtime.onMessage.removeListener(listener);
      clearTimeout(timer);
      if (error) reject(new Error(error));
      else resolve();
    };
    const listener = (message: ClipsReady): void => {
      if (message?.type === CLIPS_READY) settle(message.error);
    };
    // Never wait forever: a recording that cannot make videos says so.
    const timer = setTimeout(() => settle('The video encoder did not start within 15 s'), 15_000);
    chrome.runtime.onMessage.addListener(listener);
  });
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Encodes a video of each scroll and click in a worker.',
  });
  await ready;

  const channel = clipChannel<FromEncoder, ToEncoder>();
  return {
    sink: clipSinkOver(channel, onClip),
    close: async () => {
      channel.close();
      await chrome.offscreen.closeDocument();
    },
  };
}

async function describeTab(tabId: number): Promise<TabSummary> {
  const tab = await chrome.tabs.get(tabId);
  return { id: tabId, windowId: tab.windowId, title: tab.title ?? '', url: tab.url ?? '' };
}
