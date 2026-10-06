/**
 * The slice of `chrome.debugger` this host uses, and nothing more.
 *
 * Declared here rather than taken from `@types/chrome` so the package stays
 * free of extension globals: the caller passes `chrome.debugger` in, and the
 * compiler checks at that call site that it fits. Tests pass a fake.
 */

/** Who an event came from. `sessionId` is set for child sessions only. */
export type Debuggee = Readonly<{
  tabId?: number;
  sessionId?: string;
}>;

/** Why Chrome ended the debugging session on its own. */
export type DetachReason = 'target_closed' | 'canceled_by_user';

export type ChromeEventListener = (
  source: Debuggee,
  method: string,
  params?: unknown,
) => void;

export type ChromeDetachListener = (source: Debuggee, reason: DetachReason) => void;

interface ChromeEvent<Listener> {
  addListener(listener: Listener): void;
  removeListener(listener: Listener): void;
}

export interface ChromeDebugger {
  attach(target: { tabId: number }, requiredVersion: string): Promise<void>;
  detach(target: { tabId: number }): Promise<void>;
  sendCommand(
    target: { tabId: number },
    method: string,
    commandParams?: { [key: string]: unknown },
  ): Promise<unknown>;
  /** Every CDP event of every session this extension has attached. */
  readonly onEvent: ChromeEvent<ChromeEventListener>;
  /**
   * The tab closed, or the user pressed Cancel on the "started debugging"
   * infobar. Not fired when the extension detaches itself.
   */
  readonly onDetach: ChromeEvent<ChromeDetachListener>;
}
