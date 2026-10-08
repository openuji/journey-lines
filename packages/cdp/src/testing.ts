/**
 * An in-memory `CdpTransport` for exercising streams without a browser.
 *
 * Tests script Chromium's side of the conversation: `respond` sets what a
 * command returns, `emit` plays an event, and `sent` records every command the
 * code under test issued, in order. Time is a manual clock: it stands still
 * until `advance` moves it, and timers set on it fire only then.
 */

import { createCdpEventRouter } from './router.js';
import type { SessionEnd, TabHost, TabSession } from './target.js';
import type {
  CdpCommand,
  CdpEventName,
  CdpResult,
  CdpTransport,
  Clock,
  Unsubscribe,
} from './transport.js';

export interface SentCommand {
  readonly method: string;
  readonly params: unknown;
}

export interface FakeCdpTransport extends CdpTransport {
  /** Every command sent so far, in order. */
  readonly sent: readonly SentCommand[];
  /** Methods of `sent`, for compact assertions. */
  sentMethods(): string[];
  /**
   * Script a command's result. A function receives the params; throwing from it
   * rejects the `send`. Unscripted commands resolve to `{}`, as CDP answers a
   * command with no return value.
   */
  respond<M extends CdpCommand>(
    method: M,
    result: CdpResult<M> | ((params: unknown) => CdpResult<M>),
  ): void;
  /**
   * Play an event from "Chromium". Loosely typed on purpose: tests supply only
   * the fields the code under test reads.
   */
  emit(event: CdpEventName, params?: unknown): void;
  /**
   * Move the clock forward, firing every timer that comes due on the way, in
   * order; events emitted afterwards carry the new time.
   */
  advance(ms: number): void;
  listenerCount(event?: CdpEventName): number;
}

export interface FakeCdpTransportOptions {
  /** Where the clock starts, Unix epoch ms. Defaults to 0. */
  startAtMs?: number;
  /** A clock shared with other transports — one timeline, as on a real host. */
  clock?: ManualClock;
}

/** A clock that moves only when told to. */
export interface ManualClock extends Clock {
  /** Move forward `ms`, firing each timer that comes due, in deadline order. */
  advance(ms: number): void;
}

export function createManualClock(startAtMs = 0): ManualClock {
  type Timer = Readonly<{ atMs: number; fire: (atMs: number) => void }>;
  let time = startAtMs;
  const timers = new Set<Timer>();

  const nextDue = (untilMs: number): Timer | undefined => {
    let due: Timer | undefined;
    for (const timer of timers) {
      if (timer.atMs <= untilMs && (!due || timer.atMs < due.atMs)) due = timer;
    }
    return due;
  };

  return {
    now: () => time,
    at(atMs, fire) {
      const timer: Timer = { atMs, fire };
      timers.add(timer);
      return () => {
        timers.delete(timer);
      };
    },
    advance(ms) {
      const untilMs = time + ms;
      // One at a time: a timer that fires may set or cancel others.
      for (let due = nextDue(untilMs); due; due = nextDue(untilMs)) {
        timers.delete(due);
        time = Math.max(time, due.atMs);
        due.fire(due.atMs);
      }
      time = untilMs;
    },
  };
}

export function createFakeCdpTransport(
  options: FakeCdpTransportOptions = {},
): FakeCdpTransport {
  const clock = options.clock ?? createManualClock(options.startAtMs ?? 0);

  const router = createCdpEventRouter({
    clock,
    // Surface listener bugs as test failures rather than log noise.
    onListenerError: (error) => {
      throw error;
    },
  });
  const sent: SentCommand[] = [];
  const responses = new Map<string, unknown>();

  const send = async (method: string, params?: unknown): Promise<unknown> => {
    sent.push({ method, params });
    if (!responses.has(method)) return {};

    const result = responses.get(method);
    return typeof result === 'function'
      ? (result as (params: unknown) => unknown)(params)
      : result;
  };

  return {
    send: send as CdpTransport['send'],
    on: router.on,
    clock,
    sent,
    sentMethods: () => sent.map((command) => command.method),
    respond(method, result) {
      responses.set(method, result);
    },
    emit(event, params) {
      router.dispatch(event, params);
    },
    advance: (ms) => clock.advance(ms),
    listenerCount: (event) => router.listenerCount(event),
  };
}

/** A session of a `FakeTabHost`: a fake transport the test ends at will. */
export interface FakeTabSession extends TabSession {
  readonly cdp: FakeCdpTransport;
  /** Handed back through `close()`. */
  readonly closed: boolean;
  /** The host ends the session on its own, as Chrome does. */
  end(end: SessionEnd): void;
}

/**
 * An in-memory `TabHost`. Tests play the browser's side: `activate` a tab,
 * end its session, `hold` an attach until they `settle` it, `refuse` a tab
 * Chrome would keep from extensions. Every session's transport runs on one
 * shared manual clock.
 */
export interface FakeTabHost<Tab> extends TabHost<Tab> {
  readonly clock: ManualClock;
  /** The tab of every attach asked for, in order. */
  readonly attaches: readonly Tab[];
  /** The latest session handed out for `tab`. */
  session(tab: Tab): FakeTabSession;
  /** Report `tab` as the active one. */
  activate(tab: Tab): void;
  /** The window or browser goes away. */
  gone(): void;
  /** Attaches to `tab` refuse (`true`), or succeed again (`false`). */
  refuse(tab: Tab, refused?: boolean): void;
  /** Attaches to `tab` wait until `settle`. */
  hold(tab: Tab): void;
  /** Answer the held attaches of `tab`, as they would have been answered. */
  settle(tab: Tab): void;
}

export function createFakeTabHost<Tab>(
  options: { startAtMs?: number; prepare?: (cdp: FakeCdpTransport, tab: Tab) => void } = {},
): FakeTabHost<Tab> {
  const clock = createManualClock(options.startAtMs ?? 0);
  const activeListeners = new Set<(tab: Tab) => void>();
  const goneListeners = new Set<() => void>();
  const sessions = new Map<Tab, FakeTabSession>();
  const refused = new Set<Tab>();
  const held = new Map<Tab, Array<() => void>>();
  const attaches: Tab[] = [];

  const openSession = (tab: Tab): FakeTabSession => {
    const cdp = createFakeCdpTransport({ clock });
    options.prepare?.(cdp, tab);
    const closedListeners = new Set<(end: SessionEnd) => void>();
    let closed = false;
    const session: FakeTabSession = {
      cdp,
      get closed() {
        return closed;
      },
      onClosed(listener): Unsubscribe {
        closedListeners.add(listener);
        return () => closedListeners.delete(listener);
      },
      async close() {
        closed = true;
        closedListeners.clear();
      },
      end(end) {
        const listeners = [...closedListeners];
        closedListeners.clear();
        for (const listener of listeners) listener(end);
      },
    };
    sessions.set(tab, session);
    return session;
  };

  const answer = (tab: Tab): Promise<TabSession> =>
    refused.has(tab)
      ? Promise.reject(new Error('Cannot access a chrome:// URL'))
      : Promise.resolve(openSession(tab));

  return {
    clock,
    attaches,
    session(tab) {
      const session = sessions.get(tab);
      if (!session) throw new Error(`No session was handed out for ${String(tab)}`);
      return session;
    },
    onActive(listener) {
      activeListeners.add(listener);
      return () => activeListeners.delete(listener);
    },
    onGone(listener) {
      goneListeners.add(listener);
      return () => goneListeners.delete(listener);
    },
    attach(tab) {
      attaches.push(tab);
      const waiting = held.get(tab);
      if (!waiting) return answer(tab);
      return new Promise<TabSession>((resolve, reject) => {
        waiting.push(() => answer(tab).then(resolve, reject));
      });
    },
    activate(tab) {
      for (const listener of [...activeListeners]) listener(tab);
    },
    gone() {
      for (const listener of [...goneListeners]) listener();
    },
    refuse(tab, isRefused = true) {
      if (isRefused) refused.add(tab);
      else refused.delete(tab);
    },
    hold(tab) {
      if (!held.has(tab)) held.set(tab, []);
    },
    settle(tab) {
      const waiting = held.get(tab) ?? [];
      held.delete(tab);
      for (const answerHeld of waiting) answerHeld();
    },
  };
}
