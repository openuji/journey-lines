import {
  createCdpEventRouter,
  type CdpTransport,
  type Unsubscribe,
} from '@openuji/cdp';
import type { ChromeDebugger, ChromeEventListener } from './chrome-debugger.js';

/**
 * `CdpTransport` over `chrome.debugger`, for one attached tab.
 *
 * `chrome.debugger.onEvent` hands over every event of every session the
 * extension has attached through one listener, in the order Chromium sent
 * them. Feeding that listener into the shared router gives the same ordering
 * and listener isolation as every other host.
 */
export function createChromeDebuggerTransport(
  chromeDebugger: ChromeDebugger,
  tabId: number,
): CdpTransport & { dispose: Unsubscribe } {
  const router = createCdpEventRouter();

  const forward: ChromeEventListener = (source, method, params) => {
    // Another tab this extension debugs is not ours. Neither is a child
    // session: nothing auto-attaches to iframes or workers yet.
    if (source.tabId !== tabId || source.sessionId !== undefined) return;
    router.dispatch(method, params);
  };
  chromeDebugger.onEvent.addListener(forward);

  const send = (method: string, params?: { [key: string]: unknown }) =>
    chromeDebugger.sendCommand({ tabId }, method, params);

  return {
    // `chrome.debugger` is untyped CDP; the transport contract types it.
    send: send as CdpTransport['send'],
    on: (event, listener) => router.on(event, listener),
    clock: router.clock,
    dispose: () => chromeDebugger.onEvent.removeListener(forward),
  };
}
