import type { Cancel, CdpTransport, Detach } from '@openuji/cdp';
import {
  arrivedAtMs,
  createPushStream,
  QUIET_AFTER_MS,
  type CompositorFrame,
  type DomainEvent,
  type PushStreamStats,
  type TimedEvent,
} from '@openuji/core';
import {
  attachCompositor,
  type ScreencastOptions,
} from '@openuji/stream-compositor';
import { attachLifecycle } from '@openuji/stream-lifecycle';
import { attachProbe } from '@openuji/stream-probe';

export interface FusedStreamOptions {
  /**
   * Cap on domain events queued but not yet consumed.
   *
   * Only compositor frames are ever evicted — lifecycle and probe events
   * are the signals rules arm on, and losing one silently corrupts a recording.
   * Omit for an unbounded queue (the default).
   */
  maxPendingEvents?: number;
  /** Called for each dropped frame once `maxPendingEvents` is exceeded. */
  onDropFrame?: (frame: CompositorFrame, totalDropped: number) => void;
  /** Passed to the compositor source's `Page.startScreencast`. */
  screencast?: ScreencastOptions;
}

export interface FusedStreamHandle {
  events: AsyncIterable<DomainEvent>;
  /** Take the sources off their transport, so the host can let it go. The queue stays open. */
  release: () => Promise<void>;
  /**
   * Put the sources on a new session to the active page: the same tab again,
   * or another tab (`otherTab`). The engine hears `session-changed` first.
   */
  continueOn: (cdp: CdpTransport, page: { otherTab: boolean }) => Promise<void>;
  stop: () => Promise<void>;
  readonly stats: PushStreamStats;
}

/**
 * Fuses the three independent CDP sources into one ordered domain event stream.
 *
 * Two things here are the whole design:
 *
 *  1. **One transport at a time.** All three sources attach to the transport
 *     the host owns, so they share one connection; this function never closes
 *     it. A host that follows the active tab moves them to another transport
 *     with `continueOn`.
 *  2. **One FIFO queue, fed synchronously.** Each source emits from inside its
 *     CDP event handler straight into a single queue. The transport delivers
 *     events in arrival order and synchronously, so the order events reach the
 *     engine is exactly the order they arrived from Chromium — by construction.
 *     That ordering *is* the fusion: rules are written as "capture the next
 *     compositor frame after this lifecycle notification" and "the resting
 *     frame before this click". Any per-stream buffering, priority, or
 *     round-robin merge would silently capture different moments.
 *
 * The sources are the same `attach*` functions the standalone streams run, and
 * what they emit already are domain events, so a source watched in isolation
 * yields exactly what it feeds the engine here.
 *
 * The events of its own: `quiet`, once nothing has arrived for a while, and
 * `session-changed`, when the sources move to a new session.
 */
export async function createFusedStream(
  cdp: CdpTransport,
  options: FusedStreamOptions = {},
): Promise<FusedStreamHandle> {
  const { maxPendingEvents, onDropFrame, screencast } = options;

  const stream = createPushStream<DomainEvent>({
    ...(maxPendingEvents !== undefined ? { capacity: maxPendingEvents } : {}),
    evict: (event) => event.type === 'frame',
    onDrop: (event, total) => {
      if (event.type === 'frame') onDropFrame?.(event.frame, total);
    },
  });

  let transport = cdp;

  // Once nothing has arrived for `QUIET_AFTER_MS`, say so, once. A page that
  // stops moving stops painting, so without this the engine would learn that
  // only from whatever happens next. Every event re-arms the timer; `quiet`
  // itself does not. The timer is the transport's clock, so `quiet` carries
  // exactly the moment it describes.
  let cancelQuiet: Cancel | undefined;
  const push = (event: TimedEvent): void => {
    stream.push(event);
    cancelQuiet?.();
    cancelQuiet = transport.clock.at(arrivedAtMs(event) + QUIET_AFTER_MS, (atMs) =>
      stream.push({ type: 'quiet', receivedAtMs: atMs }),
    );
  };

  // Every `release` and `continueOn` begins a new move. Sources attached during
  // an older one may be slow (a page still loading) or on a dying session; they
  // are muted here, so nothing they report can reach the engine, in any order.
  let move = 0;
  const emitFor =
    (mine: number) =>
    (event: TimedEvent): void => {
      if (mine === move) push(event);
    };

  let detaches: Detach[] = [];
  try {
    detaches = await attachSources(cdp, emitFor(move), screencast);
  } catch (err) {
    cancelQuiet?.();
    stream.end();
    throw err;
  }

  const release = async (): Promise<void> => {
    move += 1;
    const current = detaches;
    detaches = [];
    await detachEach(current);
  };

  const continueOn = async (
    next: CdpTransport,
    { otherTab }: { otherTab: boolean },
  ): Promise<void> => {
    // The old session's cleanup runs alongside: a hung page can't hold this up.
    void release();
    const mine = move;
    if (stream.closed) return;

    transport = next;
    push({ type: 'session-changed', otherTab, receivedAtMs: next.clock.now() });
    const attached = await attachSources(next, emitFor(mine), screencast);

    // Overtaken by a newer move, or stopped, while attaching.
    if (stream.closed || mine !== move) await detachEach(attached);
    else detaches = attached;
  };

  const stop = async (): Promise<void> => {
    if (stream.closed) return;

    move += 1;
    await detachEach(detaches);
    detaches = [];
    // After the sources are gone, so nothing re-arms it. A push to an ended
    // stream is a no-op anyway.
    cancelQuiet?.();
    stream.end();
  };

  return { events: stream.iterable, release, continueOn, stop, stats: stream.stats };
}

/**
 * The three sources on one transport, pushing through `emit`. If any fails,
 * the ones that did attach are taken off again before the failure is thrown.
 */
async function attachSources(
  cdp: CdpTransport,
  emit: (event: TimedEvent) => void,
  screencast: ScreencastOptions | undefined,
): Promise<Detach[]> {
  // Lifecycle and probe events already are domain events; only a
  // compositor frame, which is also the payload captures carry, gets tagged.
  const attached = await Promise.allSettled([
    attachCompositor(cdp, (frame) => emit({ type: 'frame', frame }), screencast),
    attachLifecycle(cdp, emit),
    attachProbe(cdp, emit),
  ]);

  const detaches = attached.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );

  const failure = attached.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) {
    // Don't leave the sources that did attach listening on a transport nobody
    // will consume.
    await detachEach(detaches);
    throw failure.reason;
  }

  return detaches;
}

async function detachEach(detaches: readonly Detach[]): Promise<void> {
  await Promise.all(detaches.map((detach) => detach().catch(() => {})));
}
