/**
 * Shared domain models across all streams and engine components.
 *
 * ## Clocks
 *
 * Arrival order — the order events reach the one fused FIFO — is the only
 * order fusion and the rules rely on. Timestamps are diagnostic, and each one
 * names its clock:
 *
 *  - `receivedAtMs`: Unix epoch ms, stamped by the transport the moment an
 *    event arrives (`CdpTransport.now`, `Date.now` unless injected). Every
 *    frame, lifecycle event and interaction carries it; it is the one clock
 *    comparable across all events. Sources never read a clock themselves.
 *  - `swapTimeMs`: Chromium's frame-swap time, Unix epoch ms (frames).
 *  - `monotonicTime`: Chromium's `MonotonicTime` — seconds since an arbitrary
 *    origin, comparable only with other `monotonicTime` values (milestones).
 *  - `pageTimeMs`: the page's `Date.now()` at the DOM event, Unix epoch ms
 *    (interactions).
 *
 * Time decides one thing: whether something has stopped (the fused stream's
 * `quiet`, and when a scroll is over), on `receivedAtMs`.
 */

import type { ClipTraceSample } from './clip.js';
import type { InteractionAction, ScrollCause, TargetElementMeta } from './wire.js';

export type CompositorFrame = Readonly<{
  index: number;
  /**
   * The encoded image, base64 — exactly as CDP delivers it. Kept encoded so
   * the many frames no rule captures are never decoded; see `decodeBase64`.
   */
  base64: string;
  /**
   * The scroll offset Chrome stamps on the frame. Raw data only: on a real
   * page it stops changing for up to 660 ms while the page scrolls, and after
   * a scroll it may never catch up (Chrome 154). Where the page is comes from
   * the page itself: `PageScrollEvent`, `ViewState.position`.
   */
  scrollX: number;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
  pageScaleFactor: number;
  receivedAtMs: number;
  /** Absent when Chromium does not report it. */
  swapTimeMs?: number;
}>;

/** What the lifecycle source emits — straight into the fused stream. */
export type LifecycleEvent =
  /**
   * A frame now shows `url`. Either a new document — CDP `Page.frameNavigated`,
   * or the document already showing when the source attached — or, with
   * `sameDocument`, the same document under a new URL: CDP
   * `Page.navigatedWithinDocument`, which is what `history.pushState`,
   * `replaceState` and fragment changes produce. `loaderId` is the identity of
   * the document the frame shows; a same-document navigation keeps it.
   */
  | Readonly<{
      type: 'navigated';
      frameId: string;
      isMainFrame: boolean;
      loaderId: string;
      url: string;
      sameDocument: boolean;
      /** What kind of same-document navigation; absent for a new document. */
      navigationType?: 'fragment' | 'historyApi' | 'other';
      receivedAtMs: number;
    }>
  /**
   * Chromium's progress report about a document: CDP `Page.lifecycleEvent`.
   * Its `commit` milestone is one of these; a new document is `navigated`.
   */
  | Readonly<{
      type: 'milestone';
      frameId: string;
      isMainFrame: boolean;
      loaderId: string;
      name:
        | 'init'
        | 'commit'
        | 'DOMContentLoaded'
        | 'load'
        | 'firstPaint'
        | 'firstContentfulPaint'
        | 'firstMeaningfulPaint'
        | 'networkAlmostIdle'
        | 'networkIdle'
        | (string & {});
      receivedAtMs: number;
      monotonicTime: number;
    }>;

/** What the person did to an element, as the probe reports it — straight into the fused stream. */
export type InteractionEvent = Readonly<{
  type: 'interaction';
  action: InteractionAction;
  target: TargetElementMeta;
  receivedAtMs: number;
  pageTimeMs: number;
}>;

/**
 * The page scrolled to (`x`, `y`), as the page itself reports it: one per
 * `scroll` event, then one with `ended` at its `scrollend`. From the probe.
 * Continuous where frames' offsets stall: measured on a real page, never
 * more than 61 ms apart while it scrolled.
 */
export type PageScrollEvent = Readonly<{
  type: 'page-scroll';
  /** The page's `scrollend`: Chrome considers this scroll complete. */
  ended: boolean;
  x: number;
  y: number;
  receivedAtMs: number;
  pageTimeMs: number;
}>;

/**
 * Where the page is when the probe starts in it: the top of a new document,
 * or wherever an open page had been scrolled to. No scroll, just a position.
 */
export type PagePositionEvent = Readonly<{
  type: 'page-position';
  x: number;
  y: number;
  receivedAtMs: number;
  pageTimeMs: number;
}>;

/**
 * Something that starts a scroll happened: the person (wheel, touch, a key,
 * the scrollbar, a link to a place on the page) or the page's own code. A
 * change of position without one is the page re-laid out, not a scroll.
 */
export type ScrollCauseEvent = Readonly<{
  type: 'scroll-cause';
  kind: ScrollCause;
  /** The key, the API called, the link's target. */
  detail?: string;
  receivedAtMs: number;
  pageTimeMs: number;
}>;

/** What started a scroll. */
export type ScrollStart = Readonly<{ kind: ScrollCause; detail?: string }>;

/** Where the page is, CSS px, as it reported it. */
export type PagePosition = Readonly<{ x: number; y: number }>;

/**
 * How a view began: the main frame loaded a document, or the document showing
 * changed route without reloading (an SPA navigation).
 */
export type ViewEntry = 'load' | 'route';

/**
 * One step of the user's journey — what the user is looking at between two
 * navigations. A document load and an SPA route change both start one; the
 * rules engine decides which navigations do, and rules only ever see views.
 */
export type ViewState = Readonly<{
  /** Counts every view of the session; the output files are numbered by it. */
  id: number;
  /** Counts loaded documents; the views of one document share it. */
  documentId: number;
  loaderId: string;
  /** The URL showing now. Same-document URL updates change it in place. */
  url: string;
  entry: ViewEntry;
  /** A frame has been seen since the document loaded. */
  firstFrameObserved: boolean;
  lastFrame: CompositorFrame | null;
  /** Where the page last said it is; null until it has said (the probe does when it starts). */
  position: PagePosition | null;
}>;

/**
 * How long nothing may arrive before the fused stream says so with `quiet`,
 * ms. Also how long a page's offset must stay unchanged for a scroll to have
 * ended: one number for "the page has stopped".
 */
export const QUIET_AFTER_MS = 250;

/**
 * Everything the rules engine sees: the sources' events exactly as they emit
 * them, compositor frames tagged for the queue, and two events the engine and
 * recorder synthesize themselves.
 */
export type DomainEvent =
  | LifecycleEvent
  | InteractionEvent
  | PageScrollEvent
  | PagePositionEvent
  | ScrollCauseEvent
  | Readonly<{
      type: 'frame';
      frame: CompositorFrame;
    }>
  /**
   * Synthesized by the fused stream once nothing (no frame, no lifecycle event,
   * no interaction) has arrived for `QUIET_AFTER_MS`, once per quiet stretch. A
   * page that stops moving stops painting, so no next frame is coming: what
   * shows is `lastFrame`.
   */
  | Readonly<{
      type: 'quiet';
      /**
       * The moment it describes: the last event's `receivedAtMs` plus
       * `QUIET_AFTER_MS`, on the transport's clock.
       */
      receivedAtMs: number;
    }>
  /**
   * Synthesized by the rules engine — never produced by a stream. Emitted to
   * every rule against the *departing* view just before a new view takes its
   * place, so a rule can capture the final resting state.
   */
  | Readonly<{
      type: 'view-exit';
      viewId: number;
      url: string;
      nextUrl: string;
      /** How the view taking its place begins. */
      nextEntry: ViewEntry;
      /** Taken from the navigation that replaced the view. */
      receivedAtMs: number;
    }>
  | Readonly<{
      type: 'stop';
    }>;

/** Every event but `stop` carries the time it arrived. */
export type TimedEvent = Exclude<DomainEvent, { type: 'stop' }>;

/** When `event` arrived, on the transport's clock. */
export function arrivedAtMs(event: TimedEvent): number {
  return event.type === 'frame' ? event.frame.receivedAtMs : event.receivedAtMs;
}

/** Where the page said it was, and when. */
export type ScrollSample = Readonly<{
  receivedAtMs: number;
  pageTimeMs: number;
  x: number;
  y: number;
}>;

/**
 * One scroll of the page: from its first report to its `scrollend`, with no
 * new report for `QUIET_AFTER_MS` after it.
 */
export type ScrollEpisode = Readonly<{
  /**
   * Every position the page reported during the scroll, in order; the last is
   * where it landed. Distance, direction and speed all derive from it.
   */
  path: readonly ScrollSample[];
  /** What started it: the person, how, or the page's own code. */
  cause: ScrollStart;
}>;

export type MilestoneCapture = Readonly<{
  viewId: number;
  entry: ViewEntry;
  documentId: number;
  loaderId: string;
  url: string;
  label: string;
  frame: CompositorFrame;
  detail: string;
  domTarget?: TargetElementMeta;
  /** On a post-scroll capture: the scroll it ends. */
  scrollEpisode?: ScrollEpisode;
  /** Where the page said it was when captured; absent while it hasn't said. */
  position?: PagePosition;
}>;

export type InteractionLogRecord = Readonly<{
  sequence: number;
  timestamp: string; // ISO 8601
  epochMs: number;
  viewId: number;
  entry: ViewEntry;
  documentId: number;
  loaderId: string;
  url: string;
  label: string;
  screenshotFile: string;
  screenshotPath: string;
  byteLength: number;
  /**
   * Where the page said it was when captured (its last scroll report in this
   * view); absent until it has reported one.
   */
  scroll?: PagePosition;
  detail: string;
  domTarget?: TargetElementMeta;
  scrollEpisode?: ScrollEpisode;
}>;

/**
 * The log line of a kept clip: a video of the span its capture ended (today a
 * scroll, filed under its `04`). Told from a capture's line by `videoFile`.
 */
export type ClipLogRecord = Readonly<{
  sequence: number;
  timestamp: string; // ISO 8601
  epochMs: number;
  viewId: number;
  entry: ViewEntry;
  documentId: number;
  loaderId: string;
  url: string;
  /** The capture the clip belongs to, e.g. `04-post-scroll-01`. */
  label: string;
  videoFile: string;
  videoPath: string;
  mimeType: string;
  byteLength: number;
  /** One sample per frame of the video, in order: where the page was, and when. */
  trace: readonly ClipTraceSample[];
}>;
