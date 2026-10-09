/**
 * In-page probe — the observation core.
 *
 * Observes what the person clicks and the press it came from (`clicks.ts`),
 * and the page scrolling itself (`page-scroll.ts`), and hands each one, as a
 * wire payload, to whatever
 * `report` it was installed with. It reports; it decides nothing. It knows
 * nothing about how the payload leaves the page: the CDP binding entry
 * (`cdp-binding.ts`) is one delivery channel, an extension content script
 * relaying over `chrome.runtime` would be another.
 */

import type { ProbeWirePayload, TargetElementMeta } from '@openuji/core/wire';
import {
  MAX_SELECTOR_CLASSES,
  MAX_TEXT_SNIPPET_LENGTH,
  PROBE_UNINSTALL,
} from '../constants.js';
import { observeClicks } from './clicks.js';
import { observePageScroll } from './page-scroll.js';

/** Receives each payload the probe sends. Must not throw into the page. */
export type ProbeReporter = (payload: ProbeWirePayload) => void;

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
  coordinates: { clientX?: number; clientY?: number },
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

function targetOf(event: MouseEvent | KeyboardEvent): TargetElementMeta | null {
  return event.target instanceof Element
    ? describeElement(event.target, event instanceof MouseEvent ? event : {})
    : null;
}

/**
 * Starts observing, reporting through `report`, once per document: the probe
 * is injected into new documents and again into the one already showing, and
 * a second install does nothing. `window[PROBE_UNINSTALL]` stops it, after
 * which an install starts again; the host calls it when the recording stops.
 */
export function installProbe(report: ProbeReporter): void {
  if (window[PROBE_UNINSTALL]) return;

  const stops = [
    // Every frame of the page: what the person clicked, and the press it came from.
    observeClicks(report, targetOf),
    // Its document scrolling itself. Which frame's document is the page is the
    // host's call: the one its session is for (`attachProbe`).
    observePageScroll(report),
  ];

  window[PROBE_UNINSTALL] = () => {
    for (const stop of stops) stop();
    delete window[PROBE_UNINSTALL];
  };
}
