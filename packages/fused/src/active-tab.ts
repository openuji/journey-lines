import type { CdpTransport, TabHost, TabSession, Unsubscribe } from '@openuji/cdp';
import { createFusedStream, type FusedStreamHandle } from './fused.js';
import {
  follow,
  initialFollowState,
  statusOf,
  type FollowEffect,
  type FollowEvent,
  type FollowStatus,
} from './follow.js';
import { runPipeline, type RecordingHandle, type RecordingOptions } from './recording.js';

export interface ActiveTabRecording<Tab> extends RecordingHandle {
  /** The session the sources are on; null while nothing is recorded. */
  readonly cdp: CdpTransport | null;
  /** Now. A new object only when its value changes, so the same object means "still current". */
  readonly status: FollowStatus<Tab>;
  /** Each new `status`. */
  onStatus(listener: (status: FollowStatus<Tab>) => void): Unsubscribe;
}

/**
 * Record `tab`, then whichever tab becomes active: the same API on every host.
 * Which tab is recorded is decided in one place, `follow`; this performs what
 * it says and reports each outcome back to it.
 */
export async function recordActiveTab<Tab>(
  host: TabHost<Tab>,
  tab: Tab,
  options: RecordingOptions,
): Promise<ActiveTabRecording<Tab>> {
  const session = await host.attach(tab);

  let fused: FusedStreamHandle;
  try {
    fused = await createFusedStream(session.cdp, options);
  } catch (error) {
    await session.close();
    throw error;
  }

  return followActiveTab(host, fused, runPipeline(fused, options), tab, session);
}

function followActiveTab<Tab>(
  host: TabHost<Tab>,
  fused: FusedStreamHandle,
  pipeline: RecordingHandle,
  tab: Tab,
  session: TabSession,
): ActiveTabRecording<Tab> {
  let state = initialFollowState(tab, session);
  let status = statusOf(state);
  const listeners = new Set<(status: FollowStatus<Tab>) => void>();
  let unsubscribes: Unsubscribe[] = [];
  let stopped: Promise<void> | null = null;

  // Each effect reports its outcome through a promise, so later, and a
  // session's `close()` never fires `onClosed`: `dispatch` is never re-entered.
  const dispatch = (event: FollowEvent<Tab, TabSession>): void => {
    const result = follow(state, event);
    state = result.state;
    if (state.ended) unfollow();
    for (const effect of result.effects) perform(effect);

    const next = statusOf(state);
    if (sameStatus(next, status)) return;
    status = next;
    for (const listener of listeners) listener(status);
  };

  const perform = (effect: FollowEffect<Tab, TabSession>): void => {
    switch (effect.type) {
      case 'attach': {
        const { tab } = effect;
        host.attach(tab).then(
          (session) => {
            watch(tab, session);
            dispatch({ type: 'attached', tab, session });
          },
          () => dispatch({ type: 'attach-failed', tab }),
        );
        return;
      }
      case 'move': {
        const { tab, session, otherTab, move } = effect;
        fused.continueOn(session.cdp, { otherTab }).then(
          () => dispatch({ type: 'moved', move }),
          () => dispatch({ type: 'move-failed', tab, session }),
        );
        return;
      }
      case 'release':
        void fused.release();
        return;
      case 'close':
        void effect.session.close().catch(() => {});
        return;
    }
  };

  const watch = (tab: Tab, session: TabSession): void => {
    session.onClosed((end) => dispatch({ type: 'session-ended', tab, session, end }));
  };

  const unfollow = (): void => {
    for (const unsubscribe of unsubscribes) unsubscribe();
    unsubscribes = [];
  };

  watch(tab, session);
  unsubscribes = [
    host.onActive((tab) => dispatch({ type: 'active', tab })),
    host.onGone(() => dispatch({ type: 'gone' })),
  ];

  return {
    get cdp() {
      return state.sources ? (state.sessions.get(state.sources.tab)?.cdp ?? null) : null;
    },

    get stats() {
      return pipeline.stats;
    },

    get status() {
      return status;
    },

    onStatus(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * Stop following, flush the final resting state, drain, and close every
     * session. Never waits for an attach: one that lands later is closed.
     */
    stop() {
      return (stopped ??= (async () => {
        dispatch({ type: 'stop' });
        try {
          await pipeline.stop();
        } finally {
          const sessions = [...state.sessions.values()];
          await Promise.all(sessions.map((session) => session.close().catch(() => {})));
        }
      })());
    },
  };
}

function sameStatus<Tab>(a: FollowStatus<Tab>, b: FollowStatus<Tab>): boolean {
  return a.active.tab === b.active.tab && a.active.state === b.active.state && a.ended === b.ended;
}
