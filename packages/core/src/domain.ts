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
 */

import type { InteractionAction, TargetElementMeta } from './wire.js';

export type CompositorFrame = Readonly<{
  index: number;
  /**
   * The encoded image, base64 — exactly as CDP delivers it. Kept encoded so
   * the many frames no rule captures are never decoded; see `decodeBase64`.
   */
  base64: string;
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

/** What the interaction source emits — straight into the fused stream. */
export type InteractionEvent = Readonly<{
  type: 'interaction';
  action: InteractionAction;
  target: TargetElementMeta;
  receivedAtMs: number;
  pageTimeMs: number;
}>;

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
}>;

/**
 * Everything the rules engine sees: the sources' events exactly as they emit
 * them, compositor frames tagged for the queue, and two events the engine and
 * recorder synthesize themselves.
 */
export type DomainEvent =
  | LifecycleEvent
  | InteractionEvent
  | Readonly<{
      type: 'frame';
      frame: CompositorFrame;
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
  /** The page's scroll offset in the captured frame, as the compositor reports it. */
  scroll: Readonly<{
    x: number;
    y: number;
  }>;
  detail: string;
  domTarget?: TargetElementMeta;
}>;
