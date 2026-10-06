/**
 * An in-memory `CdpTransport` for exercising streams without a browser.
 *
 * Tests script Chromium's side of the conversation: `respond` sets what a
 * command returns, `emit` plays an event, and `sent` records every command the
 * code under test issued, in order. Time is a manual clock: it stands still
 * until `advance` moves it, and timers set on it fire only then.
 */

import { createCdpEventRouter } from './router.js';
import type {
  CdpCommand,
  CdpEventName,
  CdpResult,
  CdpTransport,
  Clock,
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
  const clock = createManualClock(options.startAtMs ?? 0);

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
