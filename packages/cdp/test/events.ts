import type {
  InteractionWirePayload,
  PressEndedWirePayload,
  PressWirePayload,
  ScrollCauseWirePayload,
  ScrollWirePayload,
} from '@openuji/core';
import type { FakeCdpTransport } from '@openuji/cdp/testing';

/**
 * Scripted Chromium: the CDP events the sources listen for, with only
 * the fields they read.
 */

let nextFrameSession = 0;

export function screencastFrame(
  cdp: FakeCdpTransport,
  overrides: {
    sessionId?: number;
    scrollY?: number;
    data?: string;
    /** When Chrome drew it, its monotonic clock, seconds (Chrome 156 on). */
    monotonicTimestamp?: number;
  } = {},
): number {
  const sessionId = overrides.sessionId ?? ++nextFrameSession;
  cdp.emit('Page.screencastFrame', {
    data: overrides.data ?? 'cG5n',
    sessionId,
    metadata: {
      offsetTop: 0,
      pageScaleFactor: 1,
      deviceWidth: 1280,
      deviceHeight: 800,
      scrollOffsetX: 0,
      scrollOffsetY: overrides.scrollY ?? 0,
      timestamp: 1_700_000_000,
      // Newer than the protocol types pinned here.
      ...(overrides.monotonicTimestamp !== undefined
        ? ({ monotonicTimestamp: overrides.monotonicTimestamp } as object)
        : {}),
    },
  });
  return sessionId;
}

export function frameNavigated(
  cdp: FakeCdpTransport,
  loaderId: string,
  options: { url?: string; frameId?: string; parentId?: string; mimeType?: string } = {},
): void {
  cdp.emit('Page.frameNavigated', {
    frame: {
      id: options.frameId ?? 'main',
      loaderId,
      url: options.url ?? `https://example.com/${loaderId}`,
      mimeType: options.mimeType ?? 'text/html',
      ...(options.parentId ? { parentId: options.parentId } : {}),
    },
    type: 'Navigation',
  });
}

/** Chrome attached a session under `cdp`'s (`Target.setAutoAttach`, flatten). */
export function attachedToTarget(cdp: FakeCdpTransport, sessionId: string): void {
  cdp.emit('Target.attachedToTarget', {
    sessionId,
    targetInfo: { targetId: sessionId, type: 'iframe', url: '' },
    waitingForDebugger: false,
  });
}

/** The session `sessionId` under `cdp`'s is gone, with its frame. */
export function detachedFromTarget(cdp: FakeCdpTransport, sessionId: string): void {
  cdp.emit('Target.detachedFromTarget', { sessionId });
}

/** What `history.pushState`, `replaceState` and fragment changes produce. */
export function navigatedWithinDocument(
  cdp: FakeCdpTransport,
  url: string,
  options: {
    frameId?: string;
    navigationType?: 'fragment' | 'historyApi' | 'other';
  } = {},
): void {
  cdp.emit('Page.navigatedWithinDocument', {
    frameId: options.frameId ?? 'main',
    url,
    navigationType: options.navigationType ?? 'historyApi',
  });
}

export function lifecycleEvent(
  cdp: FakeCdpTransport,
  name: string,
  loaderId: string,
  frameId = 'main',
  timestamp = 1,
): void {
  cdp.emit('Page.lifecycleEvent', { frameId, loaderId, name, timestamp });
}

/** The page already shows a document when a source attaches. */
export function showingDocument(
  cdp: FakeCdpTransport,
  loaderId: string,
  url = `https://example.com/${loaderId}`,
  mimeType = 'text/html',
): void {
  cdp.respond('Page.getFrameTree', {
    frameTree: { frame: { id: 'main', loaderId, url, mimeType } },
  } as never);
}

/**
 * What Chromium does when lifecycle reporting is switched on: report the
 * milestones the current document already reached, before answering.
 */
export function replayOnEnable(cdp: FakeCdpTransport, replay: () => void): void {
  cdp.respond('Page.setLifecycleEventsEnabled', (params) => {
    if ((params as { enabled: boolean }).enabled) replay();
    return {} as never;
  });
}

export function bindingCalled(
  cdp: FakeCdpTransport,
  name: string,
  payload: string,
  executionContextId = 1,
): void {
  cdp.emit('Runtime.bindingCalled', { name, payload, executionContextId });
}

export function clickPayload(
  selector = 'a.link',
  extra: Pick<InteractionWirePayload, 'eventTimeMs' | 'pressId' | 'trusted'> = {},
): string {
  const payload: InteractionWirePayload = {
    action: 'click',
    target: {
      tagName: 'a',
      selector,
      clientX: 10,
      clientY: 20,
      boundingRect: { x: 0, y: 0, width: 100, height: 40 },
    },
    pageTimeMs: 1_700_000_000_000,
    ...extra,
  };
  return JSON.stringify(payload);
}

/** What starts a click, as the probe reports it before the page responds. */
export function pressPayload(
  pressId: string,
  eventTimeMs: number,
  kind: PressWirePayload['kind'] = 'pointer',
  detail = kind === 'pointer' ? 'mouse' : 'Enter',
  selector = 'a.link',
): string {
  const payload: PressWirePayload = {
    action: 'press',
    kind,
    detail,
    target: JSON.parse(clickPayload(selector)).target,
    pressId,
    eventTimeMs,
    pageTimeMs: 1_700_000_000_000,
  };
  return JSON.stringify(payload);
}

/** A press that ended without a click, as the probe reports it. */
export function pressEndedPayload(pressId: string): string {
  const payload: PressEndedWirePayload = { action: 'press-ended', pressId, pageTimeMs: 1_700_000_000_000 };
  return JSON.stringify(payload);
}

/** The page reporting where it scrolled to; `ended` is its `scrollend`. */
export function scrollPayload(y: number, ended = false, x = 0): string {
  const payload: ScrollWirePayload = {
    action: ended ? 'scrollend' : 'scroll',
    x,
    y,
    pageTimeMs: 1_700_000_000_000,
  };
  return JSON.stringify(payload);
}

/** Something that starts a scroll, as the probe reports it before the page moves. */
export function causePayload(kind: ScrollCauseWirePayload['kind'] = 'wheel', detail?: string): string {
  const payload: ScrollCauseWirePayload = {
    action: 'scroll-cause',
    kind,
    ...(detail ? { detail } : {}),
    pageTimeMs: 1_700_000_000_000,
  };
  return JSON.stringify(payload);
}

/** The page saying where it is when the probe starts in it. */
export function positionPayload(y: number, x = 0): string {
  const payload: ScrollWirePayload = { action: 'position', x, y, pageTimeMs: 1_700_000_000_000 };
  return JSON.stringify(payload);
}

export async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const value of iterable) out.push(value);
  return out;
}
