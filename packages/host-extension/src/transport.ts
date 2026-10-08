import {
  createCdpEventRouter,
  type CdpTransport,
  type Unsubscribe,
} from '@openuji/cdp';
import type { ChromeDebugger, ChromeEventListener } from './chrome-debugger.js';

/**
 * `CdpTransport` over `chrome.debugger`, for one attached tab, or with
 * `sessionId` for one child session within it.
 *
 * `chrome.debugger.onEvent` hands over every event of every session the
 * extension has attached through one listener, in the order Chromium sent
 * them. Feeding that listener into the shared router gives the same ordering
 * and listener isolation as every other host.
 */
export function createChromeDebuggerTransport(
  chromeDebugger: ChromeDebugger,
  tabId: number,
  sessionId?: string,
): CdpTransport & { dispose: Unsubscribe } {
  const router = createCdpEventRouter();

  const forward: ChromeEventListener = (source, method, params) => {
    // Another tab this extension debugs is not ours, nor another session of this one.
    if (source.tabId !== tabId || source.sessionId !== sessionId) return;
    router.dispatch(method, params);
  };
  chromeDebugger.onEvent.addListener(forward);

  // Commands to the tab go by tab, not by session: once disposed, a send could
  // reach a newer session on the same tab. So it is refused here, without
  // asking Chrome.
  const target = sessionId === undefined ? { tabId } : { tabId, sessionId };
  let disposed = false;
  const send = (method: string, params?: { [key: string]: unknown }) =>
    disposed
      ? Promise.reject(new Error(`The debugging session of tab ${tabId} has ended`))
      : chromeDebugger.sendCommand(target, method, params);

  return {
    // `chrome.debugger` is untyped CDP; the transport contract types it.
    send: send as CdpTransport['send'],
    on: (event, listener) => router.on(event, listener),
    clock: router.clock,
    child: (id) => createChromeDebuggerTransport(chromeDebugger, tabId, id),
    dispose: () => {
      disposed = true;
      chromeDebugger.onEvent.removeListener(forward);
    },
  };
}
