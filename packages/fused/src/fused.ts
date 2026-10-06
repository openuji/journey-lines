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
import { attachInteraction } from '@openuji/stream-interaction';

export interface FusedStreamOptions {
  /**
   * Cap on domain events queued but not yet consumed.
   *
   * Only compositor frames are ever evicted — lifecycle and interaction events
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
  stop: () => Promise<void>;
  readonly stats: PushStreamStats;
}

/**
 * Fuses the three independent CDP sources into one ordered domain event stream.
 *
 * Two things here are the whole design:
 *
 *  1. **One transport.** All three sources attach to the transport the host
 *     owns, so they share one connection; this function never closes it.
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
 * The one event of its own: `quiet`, once nothing has arrived for a while.
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

  // Once nothing has arrived for `QUIET_AFTER_MS`, say so, once. A page that
  // stops moving stops painting, so without this the engine would learn that
  // only from whatever happens next. Every event re-arms the timer; `quiet`
  // itself does not. The timer is the transport's clock, so `quiet` carries
  // exactly the moment it describes.
  let cancelQuiet: Cancel | undefined;
  const push = (event: TimedEvent): void => {
    stream.push(event);
    cancelQuiet?.();
    cancelQuiet = cdp.clock.at(arrivedAtMs(event) + QUIET_AFTER_MS, (atMs) =>
      stream.push({ type: 'quiet', receivedAtMs: atMs }),
    );
  };

  // Lifecycle and interaction events already are domain events; only a
  // compositor frame, which is also the payload captures carry, gets tagged.
  const attached = await Promise.allSettled([
    attachCompositor(cdp, (frame) => push({ type: 'frame', frame }), screencast),
    attachLifecycle(cdp, push),
    attachInteraction(cdp, push),
  ]);

  const detaches: Detach[] = attached.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );

  const detachAll = async (): Promise<void> => {
    await Promise.all(detaches.map((detach) => detach().catch(() => {})));
    // After the sources are gone, so nothing re-arms it. A push to an ended
    // stream is a no-op anyway.
    cancelQuiet?.();
  };

  const failure = attached.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) {
    // Don't leave the sources that did attach listening on a transport nobody
    // will consume.
    await detachAll();
    stream.end();
    throw failure.reason;
  }

  const stop = async (): Promise<void> => {
    if (stream.closed) return;

    await detachAll();
    stream.end();
  };

  return { events: stream.iterable, stop, stats: stream.stats };
}
