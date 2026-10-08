import { describe, expect, it } from 'vitest';
import { createFakeCdpTransport } from '@openuji/cdp/testing';
import type { DocumentEvent } from '@openuji/core';
import { htmlDocuments } from '@openuji/stream-html';
import { createLifecycleStream } from '@openuji/stream-lifecycle';
import { PROBE_BINDING_NAME } from '@openuji/stream-probe';
import {
  bindingCalled,
  collect,
  frameNavigated,
  lifecycleEvent,
  replayOnEnable,
  scrollPayload,
  showingDocument,
} from '../../cdp/test/events.js';

/** What the page reported, in the stack's terms. */
function summarize(events: readonly DocumentEvent[]): string[] {
  return events.flatMap((e) =>
    e.type === 'milestone' ? [`${e.name} ${e.loaderId}`] : e.type === 'navigated' ? [] : [e.type],
  );
}

describe('htmlDocuments', () => {
  it('describes every document', () => {
    expect(
      htmlDocuments.describes({ frameId: 'main', loaderId: 'a', url: 'https://example.com/', mimeType: 'image/png' }),
    ).toBe(true);
  });

  it("reports how far the page has come in the stack's terms, for the document showing only", async () => {
    const cdp = createFakeCdpTransport();
    const { events, stop } = await createLifecycleStream(cdp, [htmlDocuments]);

    frameNavigated(cdp, 'loader-a');
    frameNavigated(cdp, 'loader-sub', { frameId: 'child', parentId: 'main' });
    lifecycleEvent(cdp, 'firstPaint', 'loader-a');
    lifecycleEvent(cdp, 'DOMContentLoaded', 'loader-a');
    lifecycleEvent(cdp, 'DOMContentLoaded', 'loader-sub', 'child');
    lifecycleEvent(cdp, 'load', 'loader-a');
    lifecycleEvent(cdp, 'networkAlmostIdle', 'loader-a');
    await stop();

    expect(summarize(await collect(events))).toEqual(['ready loader-a', 'settled loader-a']);
  });

  it("reports a loaded page's progress from now on, never what it had already reached", async () => {
    const cdp = createFakeCdpTransport();
    showingDocument(cdp, 'loader-now');
    replayOnEnable(cdp, () => {
      lifecycleEvent(cdp, 'DOMContentLoaded', 'loader-now');
      lifecycleEvent(cdp, 'networkAlmostIdle', 'loader-now');
    });

    const { events, stop } = await createLifecycleStream(cdp, [htmlDocuments]);
    frameNavigated(cdp, 'loader-a');
    lifecycleEvent(cdp, 'networkAlmostIdle', 'loader-a');
    await stop();

    expect(summarize(await collect(events))).toEqual(['settled loader-a']);
  });

  it('reports what the probe in the page sees', async () => {
    const cdp = createFakeCdpTransport();
    showingDocument(cdp, 'loader-now');
    const { events, stop } = await createLifecycleStream(cdp, [htmlDocuments]);

    bindingCalled(cdp, PROBE_BINDING_NAME, scrollPayload(300));
    await stop();

    expect(summarize(await collect(events))).toEqual(['page-scroll']);
  });

  it('turns lifecycle reporting off and takes the probe out on stop', async () => {
    const cdp = createFakeCdpTransport();
    const { stop } = await createLifecycleStream(cdp, [htmlDocuments]);

    await stop();

    expect(cdp.sent).toContainEqual({
      method: 'Page.setLifecycleEventsEnabled',
      params: { enabled: false },
    });
    expect(cdp.sentMethods()).toContain('Runtime.removeBinding');
    expect(cdp.listenerCount()).toBe(0);
  });
});
