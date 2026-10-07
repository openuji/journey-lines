import type { CompositorFrame, DomainEvent, TargetElementMeta } from '@openuji/core';

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

export function milestone(name: string, loaderId: string, receivedAtMs = 0): DomainEvent {
  return {
    type: 'milestone',
    frameId: 'main',
    isMainFrame: true,
    loaderId,
    name,
    receivedAtMs,
    monotonicTime: 0,
  };
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

export function click(selector?: string, receivedAtMs = 0): DomainEvent {
  return {
    type: 'interaction',
    action: 'click',
    target: target(selector),
    receivedAtMs,
    pageTimeMs: 0,
  };
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
