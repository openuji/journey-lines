import type { CdpTransport, Detach } from '@openuji/cdp';
import {
  createPushStream,
  type InteractionEvent,
  type PagePositionEvent,
  type PageScrollEvent,
  type ProbeWirePayload,
  type PushStreamStats,
  type ScrollCauseEvent,
  type ScrollWirePayload,
} from '@openuji/core';
import { PROBE_BINDING_NAME, PROBE_SOURCE } from '@openuji/client-probe';

/** What the interaction source emits: what the person did to an element, and the page's own scrolling. */
export type ProbeEvent = InteractionEvent | PageScrollEvent | PagePositionEvent | ScrollCauseEvent;

export interface InteractionStreamHandle {
  events: AsyncIterable<ProbeEvent>;
  stop: () => Promise<void>;
  readonly stats: PushStreamStats;
}

/**
 * Decodes one JSON payload the probe sent. Independent of how it travelled, so
 * any delivery channel can reuse it. Returns `null` for anything malformed.
 *
 * `receivedAtMs` is when the payload reached the host (see the clocks note in
 * `@openuji/core`); the probe's own `pageTimeMs` is carried through as is.
 */
export function decodeProbePayload(
  json: string,
  receivedAtMs: number,
): ProbeEvent | null {
  let payload: ProbeWirePayload;
  try {
    payload = JSON.parse(json) as ProbeWirePayload;
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;

  if (payload.action === 'scroll-cause') {
    const { kind, detail, pageTimeMs } = payload;
    return { type: 'scroll-cause', kind, ...(detail ? { detail } : {}), receivedAtMs, pageTimeMs };
  }

  if (isScroll(payload)) {
    const { x, y, pageTimeMs } = payload;
    if (payload.action === 'position') {
      return { type: 'page-position', x, y, receivedAtMs, pageTimeMs };
    }
    return {
      type: 'page-scroll',
      ended: payload.action === 'scrollend',
      x: payload.x,
      y: payload.y,
      receivedAtMs,
      pageTimeMs: payload.pageTimeMs,
    };
  }

  return {
    type: 'interaction',
    action: payload.action,
    target: payload.target,
    receivedAtMs,
    pageTimeMs: payload.pageTimeMs,
  };
}

function isScroll(payload: Exclude<ProbeWirePayload, { action: 'scroll-cause' }>): payload is ScrollWirePayload {
  return payload.action === 'position' || payload.action === 'scroll' || payload.action === 'scrollend';
}

/**
 * Installs the in-page probe and emits the user interactions it reports,
 * synchronously from inside the CDP event handler.
 *
 * The probe (`@openuji/client-probe`) runs in the page and calls back through a
 * CDP binding; this side owns the binding, the injection, and the decoding.
 * Binding calls travel in the same ordered CDP event stream as compositor
 * frames, which is what keeps "the resting frame before this click" exact.
 * Shared by the standalone stream and the fused orchestrator.
 */
export async function attachInteraction(
  cdp: CdpTransport,
  emit: (event: ProbeEvent) => void,
): Promise<Detach> {
  const unsubscribe = cdp.on('Runtime.bindingCalled', (raw, { receivedAtMs }) => {
    if (raw.name !== PROBE_BINDING_NAME) return;

    const event = decodeProbePayload(raw.payload, receivedAtMs);
    if (!event) {
      console.error('Ignoring malformed interaction payload:', raw.payload);
      return;
    }
    emit(event);
  });

  let scriptId: string | undefined;

  // Best-effort: the page may already be gone. In an extension the tab outlives
  // the recording, so leaving the binding and script behind would keep the
  // probe injecting into every later document.
  const cleanup = async (): Promise<void> => {
    unsubscribe();
    const identifier = scriptId;
    if (identifier) {
      await cdp
        .send('Page.removeScriptToEvaluateOnNewDocument', { identifier })
        .catch(() => {});
    }
    await cdp
      .send('Runtime.removeBinding', { name: PROBE_BINDING_NAME })
      .catch(() => {});
  };

  try {
    await cdp.send('Runtime.enable');
    await cdp.send('Runtime.addBinding', { name: PROBE_BINDING_NAME });

    await cdp.send('Page.enable');
    scriptId = (
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: PROBE_SOURCE,
      })
    )?.identifier;

    // The script above only runs in documents created from now on. A host that
    // attaches to a page already showing a document (an extension attaching to
    // an open tab) needs the probe there too; the probe's own guard makes a
    // second install a no-op.
    await cdp
      .send('Runtime.evaluate', { expression: PROBE_SOURCE })
      .catch(() => {});
  } catch (err) {
    await cleanup();
    throw err;
  }

  return cleanup;
}

/**
 * Streams user interactions on their own — no orchestrator, no sibling
 * streams. Leaves the transport to its owner.
 *
 * Like the lifecycle stream it never drops — a click is an arming signal a rule
 * is waiting on.
 */
export async function createInteractionStream(
  cdp: CdpTransport,
): Promise<InteractionStreamHandle> {
  const stream = createPushStream<ProbeEvent>();

  const detach = await attachInteraction(cdp, (event) => stream.push(event));

  const stop = async (): Promise<void> => {
    if (stream.closed) return;

    await detach();
    stream.end();
  };

  return { events: stream.iterable, stop, stats: stream.stats };
}

export { PROBE_BINDING_NAME, PROBE_SOURCE } from '@openuji/client-probe';
