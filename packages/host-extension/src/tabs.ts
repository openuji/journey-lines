import type { TabHost } from '@openuji/cdp';
import type { ChromeDebugger } from './chrome-debugger.js';
import type { ChromeTabs, ChromeWindows } from './chrome-tabs.js';
import { attachTab } from './target.js';

export interface ChromeApis {
  readonly debugger: ChromeDebugger;
  readonly tabs: ChromeTabs;
  readonly windows: ChromeWindows;
}

/**
 * The tabs of one window, as `recordActiveTab` follows them. A tab is its id.
 *
 * Chrome says which tab is active; a tab that commits a new URL while active is
 * reported again, since a page Chrome kept from extensions (a `chrome://` page,
 * the New Tab page) may have become recordable.
 */
export function extensionTabs(chrome: ChromeApis, windowId: number): TabHost<number> {
  return {
    onActive(listener) {
      const activated = (activeInfo: { tabId: number; windowId: number }): void => {
        if (activeInfo.windowId === windowId) listener(activeInfo.tabId);
      };
      const updated = (
        tabId: number,
        changeInfo: { url?: string },
        tab: { active: boolean; windowId: number },
      ): void => {
        if (changeInfo.url && tab.active && tab.windowId === windowId) listener(tabId);
      };
      chrome.tabs.onActivated.addListener(activated);
      chrome.tabs.onUpdated.addListener(updated);
      return () => {
        chrome.tabs.onActivated.removeListener(activated);
        chrome.tabs.onUpdated.removeListener(updated);
      };
    },

    onGone(listener) {
      const removed = (removedId: number): void => {
        if (removedId === windowId) listener();
      };
      chrome.windows.onRemoved.addListener(removed);
      return () => chrome.windows.onRemoved.removeListener(removed);
    },

    attach: (tabId) => attachTab(chrome.debugger, tabId),
  };
}
