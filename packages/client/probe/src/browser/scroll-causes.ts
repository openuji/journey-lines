/**
 * What starts a scroll of the page, reported before the page reports moving.
 *
 * A change of the page's position without one of these is the page re-laid
 * out — a resize, images loading above, fonts — and Chrome keeping the
 * content in place: no scroll. Measured on Chrome 154, each cause below came
 * before the page's first `scroll` report (0–21 ms); a resize came with none.
 *
 * Only reports. Must never break the page: every hook calls the original
 * exactly as the page did, and reporting can never throw into it.
 */

import type { ScrollCause, ScrollCauseWirePayload } from '@openuji/core/wire';

type Report = (payload: ScrollCauseWirePayload) => void;

/** Keys that scroll the page (Tab, by moving focus to an element off-screen). */
const SCROLL_KEYS = new Set([
  'PageDown',
  'PageUp',
  ' ',
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'Tab',
]);

/** Overlay scrollbars (macOS) take no layout space: a press this close to the edge is on one. */
const OVERLAY_SCROLLBAR_PX = 16;

/** Causes that repeat while they last (a finger moving, a scrollbar dragged), at most this often, ms. */
const REPEAT_MS = 50;

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** The element that scrolls the page itself. */
function isPageScroller(element: unknown): boolean {
  return (
    element === document.scrollingElement ||
    element === document.documentElement ||
    element === document.body
  );
}

/** A press on the page's own scrollbar. */
function onScrollbar(event: PointerEvent): boolean {
  const root = document.documentElement;
  const scrollable = root.scrollHeight > root.clientHeight || root.scrollWidth > root.clientWidth;
  return (
    scrollable &&
    (event.clientX >= root.clientWidth ||
      event.clientY >= root.clientHeight ||
      window.innerWidth - event.clientX <= OVERLAY_SCROLLBAR_PX)
  );
}

/** A link to a place on this same page. */
function samePageAnchor(target: EventTarget | null): string | null {
  const link = target instanceof Element ? target.closest('a[href]') : null;
  if (!(link instanceof HTMLAnchorElement) || !link.hash) return null;
  const here = new URL(location.href);
  const there = new URL(link.href, location.href);
  return there.origin === here.origin && there.pathname === here.pathname && there.search === here.search
    ? link.hash
    : null;
}

/**
 * Replaces `owner[name]` with a function that first says `onCall`, then does
 * exactly what the original did. Returns how to put the original back.
 */
function hook(owner: object, name: string, onCall: (self: unknown, args: unknown[]) => void): () => void {
  const target = owner as Record<string, unknown>;
  const original = target[name];
  if (typeof original !== 'function') return () => {};
  const hooked = function (this: unknown, ...args: unknown[]): unknown {
    try {
      onCall(this, args);
    } catch {
      // Reporting never breaks the page.
    }
    return (original as (...a: unknown[]) => unknown).apply(this, args);
  };
  target[name] = hooked;
  return () => {
    if (target[name] === hooked) target[name] = original;
  };
}

/** Like `hook`, for a property's setter on a prototype. */
function hookSetter(owner: object, name: string, onSet: (self: unknown) => void): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(owner, name);
  const set = descriptor?.set;
  if (!descriptor || !set) return () => {};
  const hooked: PropertyDescriptor = {
    ...descriptor,
    set(this: unknown, value: unknown) {
      try {
        onSet(this);
      } catch {
        // Reporting never breaks the page.
      }
      set.call(this, value);
    },
  };
  Object.defineProperty(owner, name, hooked);
  return () => {
    if (Object.getOwnPropertyDescriptor(owner, name)?.set === hooked.set) {
      Object.defineProperty(owner, name, descriptor);
    }
  };
}

/** Starts observing. Returns how to stop. Run in the top document only. */
export function observeScrollCauses(report: Report): () => void {
  const lastSent = new Map<ScrollCause, number>();
  const cause = (kind: ScrollCause, detail?: string, repeating = false): void => {
    const now = Date.now();
    if (repeating && now - (lastSent.get(kind) ?? 0) < REPEAT_MS) return;
    lastSent.set(kind, now);
    report({ action: 'scroll-cause', kind, ...(detail ? { detail } : {}), pageTimeMs: now });
  };

  // The person.
  let pressingScrollbar = false;
  const listeners: [string, (event: Event) => void][] = [
    ['wheel', () => cause('wheel', undefined, true)],
    ['touchstart', () => cause('touch')],
    ['touchmove', () => cause('touch', undefined, true)],
    [
      'keydown',
      (event) => {
        const { key, target } = event as KeyboardEvent;
        if (!SCROLL_KEYS.has(key) || (key !== 'Tab' && isEditable(target))) return;
        cause('key', key === ' ' ? 'Space' : key);
      },
    ],
    [
      'pointerdown',
      (event) => {
        pressingScrollbar = onScrollbar(event as PointerEvent);
        if (pressingScrollbar) cause('scrollbar');
      },
    ],
    ['pointermove', () => pressingScrollbar && cause('scrollbar', undefined, true)],
    ['pointerup', () => (pressingScrollbar = false)],
    [
      'click',
      (event) => {
        const hash = samePageAnchor(event.target);
        if (hash) cause('link', hash);
      },
    ],
    // The page's own code, by its URL.
    ['hashchange', () => cause('script', 'location.hash')],
  ];
  const options = { capture: true, passive: true };
  for (const [type, listener] of listeners) window.addEventListener(type, listener, options);

  // The page's own code, by the calls that scroll.
  const unhooks = [
    ...['scrollTo', 'scrollBy', 'scroll'].map((name) => hook(window, name, () => cause('script', name))),
    hook(Element.prototype, 'scrollIntoView', () => cause('script', 'scrollIntoView')),
    ...['scrollTo', 'scrollBy', 'scroll'].map((name) =>
      hook(Element.prototype, name, (self) => isPageScroller(self) && cause('script', name)),
    ),
    ...['scrollTop', 'scrollLeft'].map((name) =>
      hookSetter(Element.prototype, name, (self) => isPageScroller(self) && cause('script', name)),
    ),
    hook(HTMLElement.prototype, 'focus', (_self, [focusOptions]) => {
      if (!(focusOptions as FocusOptions | undefined)?.preventScroll) cause('script', 'focus');
    }),
  ];

  return () => {
    for (const [type, listener] of listeners) window.removeEventListener(type, listener, options);
    for (const unhook of unhooks) unhook();
  };
}
