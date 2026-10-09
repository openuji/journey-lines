import type { CdpTransport, Detach } from '@openuji/cdp';
import { createPushStream, type PushStreamStats } from '@openuji/core';
import { PROBE_BINDING_NAME, PROBE_SOURCE, PROBE_UNINSTALL } from '@openuji/client-probe';
import { decodeProbePayload, type ProbeEvent } from './decode.js';

export { decodeProbePayload, type ProbeEvent } from './decode.js';

export interface ProbeStreamHandle {
  events: AsyncIterable<ProbeEvent>;
  stop: () => Promise<void>;
  readonly stats: PushStreamStats;
}

/** What counts in any frame of the page: what the person clicked, and the presses. */
const FROM_ANY_FRAME: ReadonlySet<ProbeEvent['type']> = new Set(['interaction', 'press', 'press-ended']);

/**
 * Installs the in-page probe and emits what it reports, synchronously from
 * inside the CDP event handler.
 *
 * How a report gets here: `Runtime.addBinding` puts a function into the page;
 * the probe (`@openuji/client-probe`) calls it with a JSON payload; Chrome
 * sends each call as a `Runtime.bindingCalled` event, in the same ordered CDP
 * event stream as the compositor frames. Arrival order alone doesn't say
 * which frames a click came between, so a press or click also carries when
 * it happened on Chrome's clock, where that is known. This side owns the
 * binding, the injection, the decoding, and taking the probe out again.
 * Shared by the standalone stream and the fused orchestrator.
 */
export async function attachProbe(
  cdp: CdpTransport,
  emit: (event: ProbeEvent) => void,
): Promise<Detach> {
  // The probe runs in every frame of the session. The page is the session's
  // own frame — the tab's top document, or the frame the session is for —
  // so where the page is and what scrolls it come from there only; another
  // frame's are its own. Clicks and presses count in any frame.
  let ownFrame: string | undefined;
  const frameOf = new Map<number, string>();
  const elsewhere = (contextId: number): boolean => {
    const frame = frameOf.get(contextId);
    return frame !== undefined && ownFrame !== undefined && frame !== ownFrame;
  };

  // Chrome's clock for the page's own documents. A press or click says when it
  // happened in its document's time (`event.timeStamp`); its document's time
  // origin on Chrome's monotonic clock (`NavigationStart`) puts it beside the
  // frames' draw times. `Performance.getMetrics` only tells the origin of the
  // document showing *now*, so a value is kept only if the document asked
  // about is still the one showing when the answer comes: no other context of
  // the page's own frame began, ended or was cleared in between. Otherwise the
  // document gets none, and its inputs are placed by arrival — never with a
  // time that may be another document's.
  const defaultContextOf = new Map<string, number>();
  const navigationStartOf = new Map<number, number>();
  let changes = 0;
  const learnTimeOrigin = (contextId: number): void => {
    const asked = ++changes;
    cdp
      .send('Performance.getMetrics')
      .then((result) => {
        const seconds = result?.metrics?.find((m) => m.name === 'NavigationStart')?.value;
        const current = ownFrame !== undefined && defaultContextOf.get(ownFrame) === contextId;
        if (asked === changes && current && seconds !== undefined && seconds > 0) {
          navigationStartOf.set(contextId, seconds * 1000);
        }
      })
      .catch(() => {});
  };

  const unsubscribes = [
    cdp.on('Runtime.executionContextCreated', ({ context }) => {
      const frameId: unknown = context.auxData?.frameId;
      if (typeof frameId !== 'string') return;
      frameOf.set(context.id, frameId);
      if (context.auxData?.isDefault !== true) return;
      defaultContextOf.set(frameId, context.id);
      if (frameId === ownFrame) learnTimeOrigin(context.id);
    }),
    cdp.on('Runtime.executionContextDestroyed', ({ executionContextId }) => {
      const frameId = frameOf.get(executionContextId);
      frameOf.delete(executionContextId);
      navigationStartOf.delete(executionContextId);
      if (frameId !== undefined && defaultContextOf.get(frameId) === executionContextId) {
        defaultContextOf.delete(frameId);
        changes++;
      }
    }),
    cdp.on('Runtime.executionContextsCleared', () => {
      frameOf.clear();
      defaultContextOf.clear();
      navigationStartOf.clear();
      changes++;
    }),
    cdp.on('Runtime.bindingCalled', (raw, { receivedAtMs }) => {
      if (raw.name !== PROBE_BINDING_NAME) return;

      const event = decodeProbePayload(
        raw.payload,
        receivedAtMs,
        navigationStartOf.get(raw.executionContextId),
      );
      if (!event) {
        console.error('Ignoring a probe payload off the wire contract:', raw.payload.slice(0, 200));
        return;
      }
      if (!FROM_ANY_FRAME.has(event.type) && elsewhere(raw.executionContextId)) return;
      emit(event);
    }),
  ];
  const unsubscribe = (): void => {
    for (const off of unsubscribes) off();
  };

  let scriptId: string | undefined;

  // Best-effort: the page may already be gone. In an extension the tab outlives
  // the recording, so the page is left as it was found: the probe taken out of
  // the document showing (`Runtime.removeBinding` leaves both the binding
  // function and the probe in it), and kept out of every later one.
  const cleanup = async (): Promise<void> => {
    unsubscribe();
    await cdp
      .send('Runtime.evaluate', { expression: `window.${PROBE_UNINSTALL}?.()` })
      .catch(() => {});
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
    ownFrame = (await cdp.send('Page.getFrameTree'))?.frameTree?.frame.id;
    // Best-effort: without it, inputs are placed by arrival.
    await cdp.send('Performance.enable').catch(() => {});
    // The document already showing: its context was reported before the page's
    // own frame was known.
    const showing = ownFrame === undefined ? undefined : defaultContextOf.get(ownFrame);
    if (showing !== undefined) learnTimeOrigin(showing);
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
 * Streams what the probe reports on its own — no orchestrator, no sibling
 * streams. Leaves the transport to its owner.
 *
 * Like the lifecycle stream it never drops — a click is an arming signal a rule
 * is waiting on.
 */
export async function createProbeStream(cdp: CdpTransport): Promise<ProbeStreamHandle> {
  const stream = createPushStream<ProbeEvent>();

  const detach = await attachProbe(cdp, (event) => stream.push(event));

  const stop = async (): Promise<void> => {
    if (stream.closed) return;

    await detach();
    stream.end();
  };

  return { events: stream.iterable, stop, stats: stream.stats };
}

export { PROBE_BINDING_NAME, PROBE_SOURCE } from '@openuji/client-probe';
