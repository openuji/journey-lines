/**
 * Host-facing entry point for the in-page probe.
 *
 * `PROBE_SOURCE` is the bundled IIFE text produced by `build.mjs` from the CDP
 * binding entry; inject it with CDP `Page.addScriptToEvaluateOnNewDocument` and
 * install a binding named `PROBE_BINDING_NAME` to receive its payloads. Any CDP
 * host can do that — Node, Electron, or an extension through `chrome.debugger`.
 */

export {
  PROBE_BINDING_NAME,
  PROBE_INJECTED_FLAG,
  MAX_TEXT_SNIPPET_LENGTH,
  MAX_SELECTOR_CLASSES,
} from './constants.js';

export { PROBE_SOURCE } from './generated/probe-source.js';

export type {
  InteractionAction,
  InteractionWirePayload,
  TargetElementMeta,
} from '@openuji/core/wire';
