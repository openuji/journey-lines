import type {
  CdpEventParams,
  CdpTransport,
  Detach,
  Viewport,
} from '@openuji/cdp';
import {
  createPushStream,
  type CompositorFrame,
  type PushStreamStats,
} from '@openuji/core';

type RawFrame = CdpEventParams<'Page.screencastFrame'>;

/** Used only when neither the caller nor CDP can say how big the viewport is. */
const FALLBACK_VIEWPORT: Viewport = { width: 1280, height: 800 };

/** What `Page.startScreencast` is asked for. */
export interface ScreencastOptions {
  format?: 'png' | 'jpeg';
  quality?: number;
  everyNthFrame?: number;
  /**
   * CSS viewport of the recorded page, when the host knows it (a launched
   * browser does; an attached tab does not). Bounds the frame size unless
   * `maxWidth`/`maxHeight` override it. Omit to read it from
   * `Page.getLayoutMetrics`.
   */
  viewport?: Viewport;
  maxWidth?: number;
  maxHeight?: number;
  /**
   * Called for each frame left out because it was drawn before one already
   * passed on (see `attachCompositor`); default: a warning. With one frame in
   * flight Chrome sends them in order, so this should never be called.
   */
  onOutOfOrder?: (frame: CompositorFrame, totalOutOfOrder: number) => void;
}

export interface CompositorStreamOptions extends ScreencastOptions {
  /**
   * Cap on frames queued but not yet consumed. Frames carry full encoded
   * images, so an unbounded queue behind a slow consumer grows without limit.
   *
   * Omit for an unbounded queue (the default, and what the recorder uses): rules
   * count frames and fire on "the next frame after X", so dropping frames
   * changes which moment gets captured. Set this only where a bounded memory
   * ceiling matters more than frame-exact captures.
   */
  maxPendingFrames?: number;
  /** Called for each dropped frame once `maxPendingFrames` is exceeded. */
  onDrop?: (frame: CompositorFrame, totalDropped: number) => void;
}

export interface CompositorStreamHandle {
  frames: AsyncIterable<CompositorFrame>;
  stop: () => Promise<void>;
  readonly stats: PushStreamStats;
}

/**
 * Attaches the compositor source: emits a frame for every CDP
 * `Page.screencastFrame`, synchronously, from inside the event handler.
 *
 * Frames leave in the order they were drawn. Chrome is asked for one frame in
 * flight at a time: with more (its default is 3) it encodes them in parallel
 * and sends each when its encoding is done, so two can arrive swapped
 * (Chromium `page_handler.cc`, measured on Chrome 156). It is also asked to
 * keep the newest frame while one is in flight rather than drop it, so the
 * last picture of a change is never lost; pictures in between may be. A frame
 * drawn before one already passed on is left out regardless, by the time it
 * was drawn — where Chrome says it (`monotonicTimestamp`, Chrome 156 on).
 *
 * This is the one implementation of the source. The standalone stream below
 * and the fused orchestrator both run it, so what you see in isolation is
 * exactly what the fused stream is fed.
 */
export async function attachCompositor(
  cdp: CdpTransport,
  emit: (frame: CompositorFrame) => void,
  options: ScreencastOptions = {},
): Promise<Detach> {
  const { onOutOfOrder = warnOutOfOrder, ...screencast } = options;
  let frameCount = 0;
  let newestDrawnAtMs = -Infinity;
  let outOfOrder = 0;

  const unsubscribe = cdp.on('Page.screencastFrame', (raw, { receivedAtMs }) => {
    // ACK first, before any other work: Chromium withholds the next frame until
    // the previous one is acknowledged, so any delay here throttles the stream.
    void cdp
      .send('Page.screencastFrameAck', { sessionId: raw.sessionId })
      .catch(() => {});

    const frame = toFrame(raw, ++frameCount, receivedAtMs);
    if (frame.drawnAtMs !== undefined) {
      if (frame.drawnAtMs < newestDrawnAtMs) {
        onOutOfOrder(frame, ++outOfOrder);
        return;
      }
      newestDrawnAtMs = frame.drawnAtMs;
    }
    emit(frame);
  });

  try {
    const bounds = await screencastBounds(cdp, screencast);
    await cdp.send('Page.startScreencast', {
      format: screencast.format ?? 'png',
      quality: screencast.quality,
      everyNthFrame: screencast.everyNthFrame ?? 1,
      maxWidth: bounds.width,
      maxHeight: bounds.height,
      maxFramesInFlight: 1,
      sendLastFrame: true,
    });
  } catch (err) {
    unsubscribe();
    throw err;
  }

  return async () => {
    await cdp.send('Page.stopScreencast').catch(() => {});
    unsubscribe();
  };
}

/** A CDP screencast frame as a domain frame. Pure. */
function toFrame(
  { data, metadata }: RawFrame,
  index: number,
  receivedAtMs: number,
): CompositorFrame {
  return {
    index,
    base64: data,
    scrollX: metadata.scrollOffsetX,
    scrollY: metadata.scrollOffsetY,
    viewportWidth: metadata.deviceWidth,
    viewportHeight: metadata.deviceHeight,
    pageScaleFactor: metadata.pageScaleFactor,
    receivedAtMs,
    // CDP's frame-swap time (when the frame was on screen) is optional and in
    // epoch seconds.
    swapTimeMs:
      metadata.timestamp === undefined ? undefined : metadata.timestamp * 1000,
    ...drawnAt(metadata),
  };
}

/**
 * When Chrome drew the frame, on its monotonic clock: `monotonicTimestamp`,
 * seconds, sent from Chrome 156 on. Newer than the protocol types pinned here.
 */
function drawnAt(metadata: RawFrame['metadata']): { drawnAtMs?: number } {
  const seconds = (metadata as { monotonicTimestamp?: unknown }).monotonicTimestamp;
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? { drawnAtMs: seconds * 1000 }
    : {};
}

function warnOutOfOrder(frame: CompositorFrame, total: number): void {
  console.warn(
    `Left out screencast frame ${frame.index}: drawn before one already passed on (${total} so far).`,
  );
}

/**
 * Streams visual frames from CDP `Page.screencastFrame`, on its own — no
 * orchestrator, no sibling streams. Leaves the transport to its owner.
 */
export async function createCompositorStream(
  cdp: CdpTransport,
  options: CompositorStreamOptions = {},
): Promise<CompositorStreamHandle> {
  const { maxPendingFrames, onDrop, ...screencast } = options;

  const stream = createPushStream<CompositorFrame>({
    ...(maxPendingFrames !== undefined ? { capacity: maxPendingFrames } : {}),
    ...(onDrop ? { onDrop } : {}),
  });

  const detach = await attachCompositor(
    cdp,
    (frame) => stream.push(frame),
    screencast,
  );

  const stop = async (): Promise<void> => {
    if (stream.closed) return;

    await detach();
    stream.end();
  };

  return { frames: stream.iterable, stop, stats: stream.stats };
}

async function screencastBounds(
  cdp: CdpTransport,
  options: ScreencastOptions,
): Promise<Viewport> {
  const { maxWidth, maxHeight } = options;
  if (maxWidth !== undefined && maxHeight !== undefined) {
    return { width: maxWidth, height: maxHeight };
  }

  const viewport =
    options.viewport ??
    (await cdp
      .send('Page.getLayoutMetrics')
      .then(({ cssLayoutViewport }) => ({
        width: cssLayoutViewport.clientWidth,
        height: cssLayoutViewport.clientHeight,
      }))
      .catch(() => FALLBACK_VIEWPORT));

  return {
    width: maxWidth ?? viewport.width,
    height: maxHeight ?? viewport.height,
  };
}
