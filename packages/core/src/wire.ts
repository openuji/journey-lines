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

/** Exactly what the probe JSON-serializes into the CDP binding call. */
export type InteractionWirePayload = Readonly<{
  action: InteractionAction;
  target: TargetElementMeta;
  /** The page's `Date.now()` at the DOM event — Unix epoch ms, page clock. */
  pageTimeMs: number;
}>;
