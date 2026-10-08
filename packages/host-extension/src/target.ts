import {
  clearScaleFactor,
  navigateUntilClosed,
  pinScaleFactor,
  type RecordingTarget,
  type SessionEnd,
  type TabSession,
  type Unsubscribe,
} from '@openuji/cdp';
import type { ChromeDebugger, ChromeDetachListener } from './chrome-debugger.js';
import { createChromeDebuggerTransport } from './transport.js';

/** The CDP version `chrome.debugger.attach` asks for; every Chrome speaks it. */
const PROTOCOL_VERSION = '1.3';

/**
 * A tab in the user's own Chrome. The tab outlives the recording: closing the
 * target only detaches the debugger and hands the tab back as it was.
 */
export interface ExtensionTarget extends RecordingTarget, TabSession {
  readonly tabId: number;
  /**
   * Fires once if Chrome ends the session: `revoked` when the person pressed
   * Cancel, `lost` otherwise — the tab closed, or it shows a page extensions
   * may not debug (Chrome's PDF viewer).
   */
  onClosed(listener: (end: SessionEnd) => void): Unsubscribe;
}

/**
 * Attach the debugger to a tab and pin its scale factor for recording.
 *
 * The tab keeps its own size, so the target reports no viewport and the
 * compositor reads it from CDP.
 */
export async function attachTab(
  chromeDebugger: ChromeDebugger,
  tabId: number,
): Promise<ExtensionTarget> {
  try {
    await chromeDebugger.attach({ tabId }, PROTOCOL_VERSION);
  } catch (error) {
    throw new Error(explainAttachError(error), { cause: error });
  }

  const cdp = createChromeDebuggerTransport(chromeDebugger, tabId);
  const closedListeners = new Set<(end: SessionEnd) => void>();
  let ended = false;

  // The session is over. From here on the target never touches the tab again:
  // a newer session may own it, and commands go by tab.
  const finish = (): void => {
    ended = true;
    cdp.dispose();
    chromeDebugger.onDetach.removeListener(onDetach);
  };

  // Chrome ends the session on its own when the tab closes, when the person
  // presses Cancel, or when the tab shows a page extensions may not debug.
  const onDetach: ChromeDetachListener = (source, reason) => {
    if (source.tabId !== tabId) return;
    finish();
    const end: SessionEnd = reason === 'canceled_by_user' ? 'revoked' : 'lost';
    for (const listener of closedListeners) listener(end);
    closedListeners.clear();
  };
  chromeDebugger.onDetach.addListener(onDetach);

  const detach = async (): Promise<void> => {
    finish();
    closedListeners.clear();
    await chromeDebugger.detach({ tabId }).catch(() => {});
  };

  try {
    await pinScaleFactor(cdp);
  } catch (error) {
    await detach();
    throw error;
  }

  const onClosed = (listener: (end: SessionEnd) => void): Unsubscribe => {
    closedListeners.add(listener);
    return () => closedListeners.delete(listener);
  };

  return {
    tabId,
    cdp,
    navigate: (url) => navigateUntilClosed(cdp, url, onClosed),
    onClosed,
    async close() {
      if (ended) return;
      // The user keeps the tab: give it back at its own scale factor. Fails
      // harmlessly when the session ended without Chrome saying so yet.
      await clearScaleFactor(cdp).catch(() => {});
      await detach();
    },
  };
}

/**
 * Chrome's attach errors, said so a person knows what to do. The original
 * message stays in parentheses for debugging.
 */
export function explainAttachError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/another debugger/i.test(message)) {
    return `Another debugger is attached to this tab. Close DevTools on it and try again. (${message})`;
  }
  if (/cannot (access|attach)/i.test(message)) {
    return `Chrome does not let extensions record this page: chrome:// pages, the Web Store and other extensions are off limits. (${message})`;
  }
  return message;
}
