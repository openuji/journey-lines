/**
 * What starts a scroll of the page, reported before the page reports moving.
 *
 * A change of the page's position without one of these is the page re-laid
 * out — a resize, images loading above, fonts — and Chrome keeping the
 * content in place: no scroll. Measured on Chrome 154, each cause below came
 * before the page's first `scroll` report (0–21 ms); a resize came with none.
 *
 * Only reports. Must never break the page or change what it sees: a hooked
 * function is the page's own behind a `Proxy` (same name, length and
 * `[native code]`), and reporting can never throw into it.
 */

import type { ScrollCause, ScrollCauseWirePayload } from '@openuji/core/wire';
import { on } from './on.js';

type Report = (payload: ScrollCauseWirePayload) => void;

/** Called before the page's own call goes through: with its `this` and arguments. */
type Before = (self: unknown, args: unknown[]) => void;

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

/** The methods that scroll a window, or an element (here: the page's scroller). */
const SCROLL_METHODS = ['scrollTo', 'scrollBy', 'scroll'] as const;

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

/** A key that scrolls the page, outside a field that takes it (Tab moves focus from anywhere). */
function scrollsByKey(key: string, target: EventTarget | null): boolean {
  return SCROLL_KEYS.has(key) && (key === 'Tab' || !isEditable(target));
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

/** `fn` as the page knows it (its name, length and `[native code]`), calling `before` first. */
function telling<F extends object>(fn: F, before: Before): F {
  return new Proxy(fn, {
    apply(target, self, args: unknown[]) {
      try {
        before(self, args);
      } catch {
        // Reporting never breaks the page.
      }
      return Reflect.apply(target as (...a: unknown[]) => unknown, self, args);
    },
  });
}

/**
 * Puts a telling version of `owner`'s method (`value`) or setter (`set`)
 * `name` in its place. Returns how to put the original back. Leaves a
 * property it can't redefine alone.
 */
function hook(owner: object, name: string, part: 'value' | 'set', before: Before): () => void {
  const original = Object.getOwnPropertyDescriptor(owner, name);
  const fn: unknown = original?.[part];
  if (!original?.configurable || typeof fn !== 'function') return () => {};
  const hooked: PropertyDescriptor = { ...original, [part]: telling(fn, before) };
  Object.defineProperty(owner, name, hooked);
  return () => {
    if (Object.getOwnPropertyDescriptor(owner, name)?.[part] === hooked[part]) {
      Object.defineProperty(owner, name, original);
    }
  };
}

/** Starts observing. Returns how to stop. Run in the top document only. */
export function observeScrollCauses(report: Report): () => void {
  const tell = (kind: ScrollCause, detail?: string): void => {
    report({ action: 'scroll-cause', kind, ...(detail ? { detail } : {}), pageTimeMs: Date.now() });
  };
  /** A cause that repeats while it lasts, told at most every `REPEAT_MS`. */
  const lastTold = new Map<ScrollCause, number>();
  const ongoing = (kind: ScrollCause): void => {
    const now = Date.now();
    if (now - (lastTold.get(kind) ?? -Infinity) < REPEAT_MS) return;
    lastTold.set(kind, now);
    tell(kind);
  };

  let pressingScrollbar = false;
  const stops = [
    // The person.
    on('wheel', () => ongoing('wheel')),
    on('touchstart', () => tell('touch')),
    on('touchmove', () => ongoing('touch')),
    on('keydown', ({ key, target }) => {
      if (scrollsByKey(key, target)) tell('key', key === ' ' ? 'Space' : key);
    }),
    on('pointerdown', (event) => {
      pressingScrollbar = onScrollbar(event);
      if (pressingScrollbar) tell('scrollbar');
    }),
    on('pointermove', () => {
      if (pressingScrollbar) ongoing('scrollbar');
    }),
    on('pointerup', () => {
      pressingScrollbar = false;
    }),
    on('pointercancel', () => {
      pressingScrollbar = false;
    }),
    on('click', ({ target }) => {
      const hash = samePageAnchor(target);
      if (hash) tell('link', hash);
    }),

    // The page's own code.
    on('hashchange', () => tell('script', 'location.hash')),
    ...SCROLL_METHODS.map((name) => hook(window, name, 'value', () => tell('script', name))),
    ...SCROLL_METHODS.map((name) =>
      hook(Element.prototype, name, 'value', (self) => {
        if (isPageScroller(self)) tell('script', name);
      }),
    ),
    hook(Element.prototype, 'scrollIntoView', 'value', () => tell('script', 'scrollIntoView')),
    ...(['scrollTop', 'scrollLeft'] as const).map((name) =>
      hook(Element.prototype, name, 'set', (self) => {
        if (isPageScroller(self)) tell('script', name);
      }),
    ),
    hook(HTMLElement.prototype, 'focus', 'value', (_self, [options]) => {
      if (!(options as FocusOptions | undefined)?.preventScroll) tell('script', 'focus');
    }),
  ];

  return () => {
    for (const stop of stops) stop();
  };
}
