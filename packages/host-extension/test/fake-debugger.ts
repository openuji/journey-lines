import type {
  ChromeDebugger,
  ChromeDetachListener,
  ChromeEventListener,
  Debuggee,
  DetachReason,
} from '../src/chrome-debugger.js';

export interface SentCommand {
  readonly tabId: number;
  readonly sessionId?: string;
  readonly method: string;
  readonly params: unknown;
}

/**
 * An in-memory `chrome.debugger`. Tests play Chrome's side: `emit` an event,
 * `endSession` as the browser would, `failAttach` / `failCommand` to script
 * errors. `calls` records every attach, detach and command, in order.
 */
export interface FakeChromeDebugger extends ChromeDebugger {
  readonly calls: string[];
  readonly sent: SentCommand[];
  emit(source: Debuggee, method: string, params?: unknown): void;
  endSession(tabId: number, reason: DetachReason): void;
  failAttach(message: string): void;
  failCommand(method: string, message: string): void;
  listenerCount(): number;
}

export function createFakeChromeDebugger(): FakeChromeDebugger {
  const eventListeners = new Set<ChromeEventListener>();
  const detachListeners = new Set<ChromeDetachListener>();
  const failingCommands = new Map<string, string>();
  let attachError: string | undefined;

  const calls: string[] = [];
  const sent: SentCommand[] = [];

  return {
    calls,
    sent,

    async attach({ tabId }, version) {
      calls.push(`attach ${tabId} ${version}`);
      if (attachError) throw new Error(attachError);
    },

    async detach({ tabId }) {
      calls.push(`detach ${tabId}`);
    },

    async sendCommand({ tabId, sessionId }, method, params) {
      calls.push(method);
      sent.push({ tabId, ...(sessionId === undefined ? {} : { sessionId }), method, params });
      const error = failingCommands.get(method);
      if (error) throw new Error(error);
      return {};
    },

    onEvent: {
      addListener: (listener) => eventListeners.add(listener),
      removeListener: (listener) => eventListeners.delete(listener),
    },

    onDetach: {
      addListener: (listener) => detachListeners.add(listener),
      removeListener: (listener) => detachListeners.delete(listener),
    },

    emit(source, method, params) {
      for (const listener of [...eventListeners]) listener(source, method, params);
    },

    endSession(tabId, reason) {
      for (const listener of [...detachListeners]) listener({ tabId }, reason);
    },

    failAttach(message) {
      attachError = message;
    },

    failCommand(method, message) {
      failingCommands.set(method, message);
    },

    listenerCount: () => eventListeners.size + detachListeners.size,
  };
}
