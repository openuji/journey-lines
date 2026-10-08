/**
 * The slices of `chrome.tabs` and `chrome.windows` this host uses, and nothing
 * more — passed in like `chrome.debugger`, so the package stays free of
 * extension globals.
 */

import type { ChromeEvent } from './chrome-debugger.js';

export interface ChromeTabs {
  /** Another tab became the active one of its window. */
  readonly onActivated: ChromeEvent<(activeInfo: { tabId: number; windowId: number }) => void>;
  readonly onUpdated: ChromeEvent<
    (
      tabId: number,
      changeInfo: { url?: string },
      tab: { active: boolean; windowId: number },
    ) => void
  >;
}

export interface ChromeWindows {
  readonly onRemoved: ChromeEvent<(windowId: number) => void>;
}
