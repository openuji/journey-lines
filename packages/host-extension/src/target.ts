import {
  clearScaleFactor,
  navigateUntilClosed,
  pinScaleFactor,
  type RecordingTarget,
  type Unsubscribe,
} from '@openuji/cdp';
import type {
  ChromeDebugger,
  ChromeDetachListener,
  DetachReason,
} from './chrome-debugger.js';
import { createChromeDebuggerTransport } from './transport.js';

/** The CDP version `chrome.debugger.attach` asks for; every Chrome speaks it. */
const PROTOCOL_VERSION = '1.3';

/**
 * A tab in the user's own Chrome. The tab outlives the recording: closing the
 * target only detaches the debugger and hands the tab back as it was.
 */
export interface ExtensionTarget extends RecordingTarget {
  readonly tabId: number;
  /** Fires once if Chrome ends the session: the tab closed, or the user pressed Cancel. */
  onClosed(listener: (reason: DetachReason) => void): Unsubscribe;
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

  const detach = async (): Promise<void> => {
    cdp.dispose();
    // Already gone when the tab closed or the user cancelled.
    await chromeDebugger.detach({ tabId }).catch(() => {});
  };

  try {
    await pinScaleFactor(cdp);
  } catch (error) {
    await detach();
    throw error;
  }

  const onClosed = (listener: (reason: DetachReason) => void): Unsubscribe => {
    const handler: ChromeDetachListener = (source, reason) => {
      if (source.tabId !== tabId) return;
      off();
      listener(reason);
    };
    const off = (): void => chromeDebugger.onDetach.removeListener(handler);
    chromeDebugger.onDetach.addListener(handler);
    return off;
  };

  return {
    tabId,
    cdp,
    navigate: (url) => navigateUntilClosed(cdp, url, onClosed),
    onClosed,
    async close() {
      // The user keeps the tab: give it back at its own scale factor. Fails
      // harmlessly when the session already ended.
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
