/**
 * In-page DOM interaction probe — the observation core.
 *
 * Observes user interactions in the capture phase and hands each one, as a
 * wire payload, to whatever `report` it was installed with. It knows nothing
 * about how the payload leaves the page: the CDP binding entry
 * (`cdp-binding.ts`) is one delivery channel, an extension content script
 * relaying over `chrome.runtime` would be another.
 *
 * Listeners are registered in the capture phase so an interaction is reported
 * even when the page stops propagation on its own handlers.
 */

import type {
  InteractionAction,
  InteractionWirePayload,
  TargetElementMeta,
} from '@openuji/core/wire';
import {
  MAX_SELECTOR_CLASSES,
  MAX_TEXT_SNIPPET_LENGTH,
  PROBE_INJECTED_FLAG,
} from '../constants.js';

/** Receives each observed interaction. Must not throw into the page. */
export type ProbeReporter = (payload: InteractionWirePayload) => void;

const WHITESPACE = /\s+/g;

function buildSelector(element: Element): string {
  const tag = element.tagName.toLowerCase();

  if (element.id) {
    return `${tag}#${element.id}`;
  }

  // SVG elements carry an SVGAnimatedString here, not a string — skip those.
  if (typeof element.className !== 'string') {
    return tag;
  }

  const classes = element.className
    .trim()
    .split(WHITESPACE)
    .filter(Boolean)
    .slice(0, MAX_SELECTOR_CLASSES)
    .join('.');

  return classes ? `${tag}.${classes}` : tag;
}

function readTextSnippet(element: Element): string | undefined {
  // Falsy-chained, not nullish-chained: an element with empty `innerText` (any
  // input, for one) must fall through to its value and then its aria-label.
  const value =
    (element as HTMLElement).innerText ||
    (element as HTMLInputElement).value ||
    element.getAttribute('aria-label') ||
    '';

  const snippet = value
    .trim()
    .replace(WHITESPACE, ' ')
    .slice(0, MAX_TEXT_SNIPPET_LENGTH);

  return snippet || undefined;
}

/** An absent *or empty* attribute reads as undefined, so it is omitted. */
function optionalAttribute(
  element: Element,
  attribute: string,
): string | undefined {
  return element.getAttribute(attribute) || undefined;
}

function describeElement(
  element: Element,
  coordinates: { clientX: number; clientY: number },
): TargetElementMeta {
  const rect = element.getBoundingClientRect();
  const tag = element.tagName.toLowerCase();

  return {
    tagName: tag,
    id: element.id || undefined,
    className:
      typeof element.className === 'string'
        ? element.className || undefined
        : undefined,
    selector: buildSelector(element),
    role: optionalAttribute(element, 'role') ?? tag,
    ariaLabel: optionalAttribute(element, 'aria-label'),
    textSnippet: readTextSnippet(element),
    href: optionalAttribute(element, 'href'),
    inputType: optionalAttribute(element, 'type'),
    name: optionalAttribute(element, 'name'),
    clientX: coordinates.clientX,
    clientY: coordinates.clientY,
    boundingRect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  };
}

function targetOf(event: Event): TargetElementMeta | null {
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }

  // Only pointer-ish events carry coordinates.
  const mouse = event as Partial<MouseEvent>;
  return describeElement(target, {
    clientX: mouse.clientX ?? 0,
    clientY: mouse.clientY ?? 0,
  });
}

/**
 * Starts observing, reporting each interaction through `report`. Returns a
 * disposer that stops observing.
 *
 * A second install into the same document is a no-op (the returned disposer
 * does nothing), so the probe can be injected more than once safely — e.g. on
 * new documents and again into the one already showing.
 */
export function installProbe(report: ProbeReporter): () => void {
  if (window[PROBE_INJECTED_FLAG]) return () => {};
  window[PROBE_INJECTED_FLAG] = true;

  const emit = (action: InteractionAction, target: TargetElementMeta): void => {
    report({ action, target, pageTimeMs: Date.now() });
  };

  const onClick = (event: Event): void => {
    const target = targetOf(event);
    if (target) emit('click', target);
  };

  window.addEventListener('click', onClick, true);

  return () => {
    window.removeEventListener('click', onClick, true);
    window[PROBE_INJECTED_FLAG] = false;
  };
}
