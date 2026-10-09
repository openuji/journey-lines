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
 *  - `pageTimeMs`: the page's `Date.now()` at the DOM event, Unix epoch ms
 *    (interactions).
 *  - `drawnAtMs` (frames) and `happenedAtMs` (presses, clicks): Chrome's
 *    monotonic clock, ms. A frame's is when it was drawn
 *    (`monotonicTimestamp`, Chrome 156 on); an input's is its DOM event's
 *    `timeStamp` plus its document's `NavigationStart`. Either is absent where
 *    it isn't known.
 *
 * Time decides two things: whether something has stopped (the fused stream's
 * `quiet`, when a scroll is over, when a click's response has come to rest),
 * on `receivedAtMs`; and, for a click only, which frames were drawn before
 * its press and which after, on Chrome's monotonic clock — arrival can't
 * tell, a frame and the report of an input reach the host in either order.
 */

import type { ClipTraceSample } from './clip.js';
import type { InteractionAction, PressKind, ScrollCause, TargetElementMeta } from './wire.js';

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
  /** When it was drawn, Chrome's monotonic clock, ms; absent before Chrome 156. */
  drawnAtMs?: number;
}>;

/** A document's lifecycle: the frames it shows in, and how far it has come. */
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
  /** How far the document `loaderId` has come, as its kind reports it. */
  | Readonly<{
      type: 'milestone';
      name: DocumentProgress;
      loaderId: string;
      receivedAtMs: number;
    }>;

/**
 * How far a document has come, in the stack's own terms. Which of its own
 * signals is which step is its kind's decision; nothing above the kinds knows
 * those signals.
 */
export type DocumentProgress =
  /** Its content is in place. */
  | 'ready'
  /** It has finished loading and shows as it will stay. */
  | 'settled';

/** What the person did to an element, as the probe reports it — straight into the fused stream. */
export type InteractionEvent = Readonly<{
  type: 'interaction';
  action: InteractionAction;
  target: TargetElementMeta;
  receivedAtMs: number;
  pageTimeMs: number;
  /** When it happened, Chrome's monotonic clock, ms; absent where that isn't known. */
  happenedAtMs?: number;
  /** A click: the press it came from (`PressEvent.pressId`), if one was reported. */
  pressId?: string;
  /** A click: made by the browser for the person, not by the page's own code. */
  trusted?: boolean;
}>;

/**
 * What starts a click happened: the primary button went down, or a key that
 * activates (Enter, Space). The page may respond already here, before the
 * `click` — so a click's "before" is the screen before its press.
 */
export type PressEvent = Readonly<{
  type: 'press';
  kind: PressKind;
  /** The pointer type (`mouse`, `touch`, `pen`) or the key. */
  detail?: string;
  /** Names the press; the click it becomes carries it. Unique per document and frame. */
  pressId: string;
  /** When it happened, Chrome's monotonic clock, ms; absent where that isn't known. */
  happenedAtMs?: number;
  receivedAtMs: number;
  pageTimeMs: number;
}>;

/**
 * A press ended without becoming a click — a drag, a text selection, a date
 * picker that closes on the press. Reported by the page once its release is
 * over, so no click can name it any more.
 */
export type PressEndedEvent = Readonly<{
  type: 'press-ended';
  pressId: string;
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
 * How a view began: the main frame loaded a document, the document showing
 * changed route without reloading (an SPA navigation), or another tab became
 * the one recorded.
 */
export type ViewEntry = 'load' | 'route' | 'tab';

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

/** What a document's sources report: its lifecycle, and what the probe sees in it. */
export type DocumentEvent =
  | LifecycleEvent
  | InteractionEvent
  | PressEvent
  | PressEndedEvent
  | PageScrollEvent
  | PagePositionEvent
  | ScrollCauseEvent;

/**
 * Everything the rules engine sees: the sources' events exactly as they emit
 * them, compositor frames tagged for the queue, and the events the fused
 * stream, the engine and the recorder synthesize themselves.
 */
export type DomainEvent =
  | DocumentEvent
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
   * Synthesized by the fused stream when its sources move to a new session on
   * the active page: the same tab again, or another tab. Until that session
   * reports the document showing, nothing that arrives belongs to a view.
   */
  | Readonly<{
      type: 'session-changed';
      otherTab: boolean;
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
 * The log line of a kept clip: a video of the span its capture ended — a
 * scroll, filed under its `04`, or a click, under its `11`. Told from a
 * capture's line by `videoFile`.
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
  /** The capture the clip belongs to, e.g. `04-post-scroll-01`, `11-post-click-01`. */
  label: string;
  videoFile: string;
  videoPath: string;
  mimeType: string;
  byteLength: number;
  /** One sample per frame of the video, in order: where the page was, and when. */
  trace: readonly ClipTraceSample[];
}>;
