/**
 * The wire contract between the in-page probe (`@openuji/client-probe`, runs in the
 * browser) and the Node-side interaction stream (`@openuji/stream-interaction`).
 *
 * This module must stay free of any Node-only types (no `Buffer`, no `node:*`)
 * so the browser tier can depend on it via the `@openuji/core/wire` subpath without
 * pulling `@types/node` into a DOM-only program.
 */

export type InteractionAction = 'click' | 'input' | 'change';

/** Structural description of the DOM element an interaction targeted. */
export type TargetElementMeta = Readonly<{
  tagName: string;
  id?: string;
  className?: string;
  selector: string;
  role?: string;
  ariaLabel?: string;
  textSnippet?: string;
  href?: string;
  inputType?: string;
  name?: string;
  clientX: number;
  clientY: number;
  boundingRect: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}>;

/** An interaction with an element, as the probe JSON-serializes it into the CDP binding call. */
export type InteractionWirePayload = Readonly<{
  action: InteractionAction;
  target: TargetElementMeta;
  /** The page's `Date.now()` at the DOM event — Unix epoch ms, page clock. */
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

/** Everything the probe sends. */
export type ProbeWirePayload = InteractionWirePayload | ScrollWirePayload;
