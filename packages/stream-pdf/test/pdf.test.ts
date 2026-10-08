import { describe, expect, it } from 'vitest';
import { createFakeCdpTransport } from '@openuji/cdp/testing';
import type { DocumentEvent } from '@openuji/core';
import { createLifecycleStream } from '@openuji/stream-lifecycle';
import { pdfDocuments } from '@openuji/stream-pdf';
import { PROBE_BINDING_NAME } from '@openuji/stream-probe';
import {
  attachedToTarget,
  bindingCalled,
  collect,
  detachedFromTarget,
  frameNavigated,
  lifecycleEvent,
  scrollPayload,
} from '../../cdp/test/events.js';

const PDF = 'application/pdf';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const autoAttaches = (sent: readonly { method: string; params: unknown }[]) =>
  sent
    .filter((command) => command.method === 'Target.setAutoAttach')
    .map((command) => (command.params as { autoAttach: boolean }).autoAttach);

/** A PDF showing, its viewer and the PDF's frame attached under the tab. */
async function showingPdf() {
  const cdp = createFakeCdpTransport();
  const stream = await createLifecycleStream(cdp, [pdfDocuments]);
  frameNavigated(cdp, 'loader-pdf', { mimeType: PDF });
  attachedToTarget(cdp, 'viewer');
  await flush();
  const viewer = cdp.child('viewer');
  attachedToTarget(viewer, 'frame');
  await flush();
  return { cdp, viewer, frame: viewer.child('frame'), ...stream };
}

function summarize(events: readonly DocumentEvent[]): string[] {
  return events.flatMap((e) =>
    e.type === 'milestone' ? [`${e.name} ${e.loaderId}`] : e.type === 'navigated' ? [] : [e.type],
  );
}

describe('pdfDocuments', () => {
  it('describes PDFs only', () => {
    const document = { frameId: 'main', loaderId: 'a', url: 'https://example.com/a' };
    expect(pdfDocuments.describes({ ...document, mimeType: PDF })).toBe(true);
    expect(pdfDocuments.describes({ ...document, mimeType: 'text/html' })).toBe(false);
  });

  it('has Chrome attach the frames under the tab only while a PDF shows', async () => {
    const cdp = createFakeCdpTransport();
    const { stop } = await createLifecycleStream(cdp, [pdfDocuments]);

    frameNavigated(cdp, 'loader-page');
    frameNavigated(cdp, 'loader-pdf', { mimeType: PDF });
    frameNavigated(cdp, 'loader-other-pdf', { mimeType: PDF });
    frameNavigated(cdp, 'loader-page-again');
    await stop();

    expect(autoAttaches(cdp.sent)).toEqual([true, false]);
  });

  it("takes the viewer, then the PDF's frame: the probe goes in there, and its lifecycle is watched", async () => {
    const { viewer, frame, stop } = await showingPdf();

    expect(autoAttaches(viewer.sent)).toEqual([true]);
    expect(frame.sent).toContainEqual({ method: 'Runtime.addBinding', params: { name: PROBE_BINDING_NAME } });
    expect(frame.sent).toContainEqual({ method: 'Page.setLifecycleEventsEnabled', params: { enabled: true } });
    await stop();
  });

  it("reports the PDF's frame going network-idle as the document settling, and what the probe sees", async () => {
    const { frame, events, stop } = await showingPdf();

    lifecycleEvent(frame, 'load', 'frame-loader', 'frame');
    lifecycleEvent(frame, 'networkIdle', 'frame-loader', 'frame');
    bindingCalled(frame, PROBE_BINDING_NAME, scrollPayload(400));
    await stop();

    expect(summarize(await collect(events))).toEqual(['settled loader-pdf', 'page-scroll']);
  });

  it('lets a frame go when Chrome does', async () => {
    const { cdp, viewer, frame, stop } = await showingPdf();

    detachedFromTarget(viewer, 'frame');
    detachedFromTarget(cdp, 'viewer');
    await flush();

    expect([frame.disposed, viewer.disposed]).toEqual([true, true]);
    expect(frame.listenerCount()).toBe(0);
    await stop();
  });

  it('on stop takes the probe out, ends the sessions it took, and stops attaching', async () => {
    const { cdp, viewer, frame, stop } = await showingPdf();

    await stop();

    expect(frame.sent).toContainEqual({ method: 'Page.setLifecycleEventsEnabled', params: { enabled: false } });
    expect(frame.sent).toContainEqual({ method: 'Runtime.removeBinding', params: { name: PROBE_BINDING_NAME } });
    expect(viewer.sent).toContainEqual({ method: 'Target.detachFromTarget', params: { sessionId: 'frame' } });
    expect(cdp.sent).toContainEqual({ method: 'Target.detachFromTarget', params: { sessionId: 'viewer' } });
    expect(autoAttaches(cdp.sent)).toEqual([true, false]);
    expect([frame.disposed, viewer.disposed]).toEqual([true, true]);
    expect(cdp.listenerCount()).toBe(0);
  });
});
