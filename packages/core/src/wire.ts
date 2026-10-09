/**
 * The wire contract between the in-page probe (`@openuji/client-probe`, runs in the
 * browser) and the host-side probe stream (`@openuji/stream-probe`).
 *
 * This module must stay free of any Node-only types (no `Buffer`, no `node:*`)
 * so the browser tier can depend on it via the `@openuji/core/wire` subpath without
 * pulling `@types/node` into a DOM-only program. Where both sides need a list
 * of names, it is a value here and the type is derived from it.
 */

export type InteractionAction = 'click' | 'input' | 'change';

/** What a target says about itself, each only when it has one: the one list of them. */
export const TARGET_TEXT_FIELDS = [
  'id',
  'className',
  'role',
  'ariaLabel',
  'textSnippet',
  'href',
  'inputType',
  'name',
] as const;

/** Structural description of the DOM element an interaction targeted. */
export type TargetElementMeta = Readonly<
  {
    tagName: string;
    selector: string;
    clientX: number;
    clientY: number;
    boundingRect: Readonly<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  } & { [K in (typeof TARGET_TEXT_FIELDS)[number]]?: string }
>;

/** An interaction with an element, as the probe JSON-serializes it into the CDP binding call. */
export type InteractionWirePayload = Readonly<{
  action: InteractionAction;
  target: TargetElementMeta;
  /** The page's `Date.now()` at the DOM event — Unix epoch ms, page clock. */
  pageTimeMs: number;
  /**
   * The DOM event's own `timeStamp`: ms since the document's time origin. The
   * host puts it on Chrome's clock, where frames say when they were drawn.
   */
  eventTimeMs?: number;
  /** A click: the press it came from (`PressWirePayload.pressId`), if one was reported. */
  pressId?: string;
  /** A click: the browser made it for the person (`event.isTrusted`), not the page's own code. */
  trusted?: boolean;
}>;

/**
 * What starts a click: the primary button going down (`pointer`), or a key
 * that activates (`key`: Enter, Space). Reported before the page responds to
 * it — some pages respond already here, before the `click`.
 */
export const PRESS_KINDS = ['pointer', 'key'] as const;

export type PressKind = (typeof PRESS_KINDS)[number];

/** A press, before the click it may become. */
export type PressWirePayload = Readonly<{
  action: 'press';
  kind: PressKind;
  /** The pointer type (`mouse`, `touch`, `pen`) or the key. */
  detail?: string;
  /**
   * Names this press; the click it becomes carries it. Unique per document
   * and frame: a random token drawn when the probe starts there, and a count.
   */
  pressId: string;
  /** The DOM event's own `timeStamp`: ms since the document's time origin. */
  eventTimeMs: number;
  /** The page's `Date.now()` at the DOM event — Unix epoch ms, page clock. */
  pageTimeMs: number;
}>;

/**
 * A press ended without becoming a click: its release came and went, and no
 * `click` named it — a drag, a text selection, a date picker that closes on
 * the press, Space scrolling the page. A press that became a click needs no
 * end: its click is it.
 */
export type PressEndedWirePayload = Readonly<{
  action: 'press-ended';
  pressId: string;
  /** The page's `Date.now()` when it ended — Unix epoch ms, page clock. */
  pageTimeMs: number;
}>;

/**
 * The page's own scrolling: where it is when the probe starts (`position`),
 * its position at each `scroll` event, then its `scrollend` once Chrome
 * considers the scroll complete. The top document's scrolling only; elements
 * with their own scrollbar are not reported yet.
 */
export type ScrollWirePayload = Readonly<{
  action: 'position' | 'scroll' | 'scrollend';
  /** `window.scrollX` / `scrollY`, CSS px. */
  x: number;
  y: number;
  /** The page's `Date.now()` at the DOM event — Unix epoch ms, page clock. */
  pageTimeMs: number;
}>;

/**
 * What starts a scroll of the page: the one list of them. The person: a wheel
 * or trackpad, touch, a scroll key, the scrollbar, a link to a place on the
 * page. Or the page's own code (`script`): `scrollTo`, `scrollIntoView`,
 * `focus()`, `location.hash`…
 */
export const SCROLL_CAUSES = ['wheel', 'touch', 'key', 'scrollbar', 'link', 'script'] as const;

export type ScrollCause = (typeof SCROLL_CAUSES)[number];

/**
 * Something that starts a scroll happened, before the page reports moving. A
 * position change without one is the page re-laid out (a resize, content
 * loading above), not a scroll.
 */
export type ScrollCauseWirePayload = Readonly<{
  action: 'scroll-cause';
  kind: ScrollCause;
  /** The key, the API called, the link's target. */
  detail?: string;
  /** The page's `Date.now()` at the DOM event — Unix epoch ms, page clock. */
  pageTimeMs: number;
}>;

/** Everything the probe sends. */
export type ProbeWirePayload =
  | InteractionWirePayload
  | PressWirePayload
  | PressEndedWirePayload
  | ScrollWirePayload
  | ScrollCauseWirePayload;
