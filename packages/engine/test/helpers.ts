import type { CompositorFrame, DocumentProgress, DomainEvent, TargetElementMeta } from '@openuji/core';

let nextFrameIndex = 0;

/** A synthetic compositor frame. No Chromium involved. */
export function frame(
  overrides: Partial<CompositorFrame> = {},
): CompositorFrame {
  return {
    index: ++nextFrameIndex,
    base64: 'cG5n',
    scrollX: 0,
    scrollY: 0,
    viewportWidth: 1280,
    viewportHeight: 800,
    pageScaleFactor: 1,
    receivedAtMs: 0,
    ...overrides,
  };
}

export function frameEvent(overrides: Partial<CompositorFrame> = {}): DomainEvent {
  return { type: 'frame', frame: frame(overrides) };
}

export function navigated(loaderId: string, url = `https://example.com/${loaderId}`): DomainEvent {
  return {
    type: 'navigated',
    frameId: 'main',
    isMainFrame: true,
    loaderId,
    url,
    sameDocument: false,
    receivedAtMs: 0,
  };
}

/** A same-document navigation — `pushState`, `replaceState`, a fragment. */
export function withinDocument(
  url: string,
  loaderId = 'loader-a',
  overrides: { isMainFrame?: boolean; navigationType?: 'fragment' | 'historyApi' | 'other' } = {},
): DomainEvent {
  return {
    type: 'navigated',
    frameId: overrides.isMainFrame === false ? 'child' : 'main',
    isMainFrame: overrides.isMainFrame ?? true,
    loaderId,
    url,
    sameDocument: true,
    navigationType: overrides.navigationType ?? 'historyApi',
    receivedAtMs: 0,
  };
}

export function milestone(name: DocumentProgress, loaderId: string, receivedAtMs = 0): DomainEvent {
  return { type: 'milestone', name, loaderId, receivedAtMs };
}

export function target(selector = 'a.link'): TargetElementMeta {
  return {
    tagName: selector.split(/[.#]/)[0] ?? 'a',
    selector,
    clientX: 10,
    clientY: 20,
    boundingRect: { x: 0, y: 0, width: 100, height: 40 },
  };
}

/** What a click or press may say beyond when it arrived. */
export interface InputTimes {
  /** When it happened on Chrome's clock; absent: placed by arrival. */
  happenedAtMs?: number;
  /** A click: the press it came from. */
  pressId?: string;
  /** A click: made by the browser for the person (`true`) or by the page's own code (`false`). */
  trusted?: boolean;
}

export function click(selector?: string, receivedAtMs = 0, times: InputTimes = {}): DomainEvent {
  return {
    type: 'interaction',
    action: 'click',
    target: target(selector),
    receivedAtMs,
    pageTimeMs: 0,
    ...times,
  };
}

/** What starts a click: the primary button going down, or Enter/Space. */
export function press(
  pressId: string,
  receivedAtMs: number,
  { happenedAtMs, kind = 'pointer', detail = kind === 'pointer' ? 'mouse' : 'Enter', selector }: {
    happenedAtMs?: number;
    kind?: 'pointer' | 'key';
    detail?: string;
    selector?: string;
  } = {},
): DomainEvent {
  return {
    type: 'press',
    kind,
    detail,
    target: target(selector),
    pressId,
    ...(happenedAtMs !== undefined ? { happenedAtMs } : {}),
    receivedAtMs,
    pageTimeMs: 0,
  };
}

/** The page saying a press was released or cancelled, with or without a click. */
export function pressEnded(pressId: string, receivedAtMs: number): DomainEvent {
  return { type: 'press-ended', pressId, receivedAtMs, pageTimeMs: 0 };
}

/**
 * A press and the click it became, as the person makes them: down, then the
 * click on release. `between`: what arrives in the meantime, such as the frame
 * a page drew on the press already.
 */
export function pressAndClick(
  pressId: string,
  { at, clickAt, drawnAt, selector }: { at: number; clickAt: number; drawnAt?: number; selector?: string },
  between: readonly DomainEvent[] = [],
): DomainEvent[] {
  const happened = drawnAt === undefined ? {} : { happenedAtMs: drawnAt };
  return [
    press(pressId, at, { ...happened, selector }),
    ...between,
    click(selector, clickAt, { pressId, trusted: true }),
    pressEnded(pressId, clickAt),
  ];
}

/** The fused stream saying nothing has arrived for a while. */
export function quiet(receivedAtMs = 0): DomainEvent {
  return { type: 'quiet', receivedAtMs };
}

/** The page reporting where it scrolled to; `ended` is its `scrollend`. */
export function pageScroll(
  y: number,
  receivedAtMs: number,
  { ended = false, x = 0 }: { ended?: boolean; x?: number } = {},
): DomainEvent {
  return { type: 'page-scroll', ended, x, y, receivedAtMs, pageTimeMs: receivedAtMs };
}

/** The page saying where it is when the probe starts in it. */
export function pageAt(y: number, receivedAtMs = 0, x = 0): DomainEvent {
  return { type: 'page-position', x, y, receivedAtMs, pageTimeMs: receivedAtMs };
}

/** Something that starts a scroll: the person's wheel, a key…, or the page's own code. */
export function scrollCause(
  kind: 'wheel' | 'touch' | 'key' | 'scrollbar' | 'link' | 'script',
  receivedAtMs: number,
  detail?: string,
): DomainEvent {
  return { type: 'scroll-cause', kind, ...(detail ? { detail } : {}), receivedAtMs, pageTimeMs: receivedAtMs };
}

/** The person's wheel moving the page to `y`: its cause, then the page's report. */
export function moved(
  y: number,
  receivedAtMs: number,
  options: { x?: number } = {},
): DomainEvent[] {
  return [scrollCause('wheel', receivedAtMs), pageScroll(y, receivedAtMs, options)];
}
