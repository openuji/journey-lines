import { describe, expect, it, vi } from 'vitest';
import type { ChromeEvent } from '../src/chrome-debugger.js';
import { extensionTabs } from '../src/tabs.js';
import { createFakeChromeDebugger } from './fake-debugger.js';

const WINDOW = 3;

/** A `chrome.*` event the test fires by hand. */
function fakeEvent<Listener extends (...args: never[]) => void>() {
  const listeners = new Set<Listener>();
  const event: ChromeEvent<Listener> & { fire(...args: Parameters<Listener>): void; size(): number } = {
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    fire: (...args) => {
      for (const listener of listeners) listener(...args);
    },
    size: () => listeners.size,
  };
  return event;
}

function fakeChrome() {
  return {
    debugger: createFakeChromeDebugger(),
    tabs: {
      onActivated: fakeEvent<(info: { tabId: number; windowId: number }) => void>(),
      onUpdated:
        fakeEvent<
          (
            tabId: number,
            changeInfo: { url?: string },
            tab: { active: boolean; windowId: number },
          ) => void
        >(),
    },
    windows: { onRemoved: fakeEvent<(windowId: number) => void>() },
  };
}

describe('extensionTabs', () => {
  it("reports its window's active tab, and again when it commits a new URL", () => {
    const chrome = fakeChrome();
    const active = vi.fn();
    const off = extensionTabs(chrome, WINDOW).onActive(active);

    chrome.tabs.onActivated.fire({ tabId: 7, windowId: WINDOW });
    chrome.tabs.onActivated.fire({ tabId: 8, windowId: WINDOW + 1 }); // another window
    chrome.tabs.onUpdated.fire(7, { url: 'https://example.com/' }, { active: true, windowId: WINDOW });
    chrome.tabs.onUpdated.fire(9, { url: 'https://example.com/' }, { active: false, windowId: WINDOW });
    chrome.tabs.onUpdated.fire(7, {}, { active: true, windowId: WINDOW }); // a title, say

    expect(active.mock.calls).toEqual([[7], [7]]);
    off();
    expect([chrome.tabs.onActivated.size(), chrome.tabs.onUpdated.size()]).toEqual([0, 0]);
  });

  it('is gone when its window is', () => {
    const chrome = fakeChrome();
    const gone = vi.fn();
    extensionTabs(chrome, WINDOW).onGone(gone);

    chrome.windows.onRemoved.fire(WINDOW + 1);
    chrome.windows.onRemoved.fire(WINDOW);

    expect(gone).toHaveBeenCalledTimes(1);
  });

  it('attaches a tab with its scale factor pinned', async () => {
    const chrome = fakeChrome();

    const session = await extensionTabs(chrome, WINDOW).attach(7);

    expect(chrome.debugger.calls).toEqual(['attach 7 1.3', 'Emulation.setDeviceMetricsOverride']);
    await session.close();
  });
});
