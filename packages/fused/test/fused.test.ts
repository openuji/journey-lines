import { describe, expect, it } from 'vitest';
import { createFakeCdpTransport } from '@openuji/cdp/testing';
import { createFusedStream } from '@openuji/fused';
import { PROBE_BINDING_NAME } from '@openuji/stream-probe';
import {
  bindingCalled,
  clickPayload,
  collect,
  frameNavigated,
  lifecycleEvent,
  replayOnEnable,
  screencastFrame,
  showingDocument,
} from '../../cdp/test/events.js';

const viewport = { width: 1280, height: 800 };

describe('createFusedStream', () => {
  it('yields domain events in exactly the order CDP delivered them', async () => {
    const cdp = createFakeCdpTransport();
    const { events, stop } = await createFusedStream(cdp, {
      screencast: { viewport },
    });

    frameNavigated(cdp, 'loader-a');
    screencastFrame(cdp);
    lifecycleEvent(cdp, 'DOMContentLoaded', 'loader-a');
    bindingCalled(cdp, PROBE_BINDING_NAME, clickPayload());
    screencastFrame(cdp);
    lifecycleEvent(cdp, 'networkAlmostIdle', 'loader-a');
    screencastFrame(cdp);
    await stop();

    expect((await collect(events)).map((e) => e.type)).toEqual([
      'navigated',
      'frame',
      'milestone',
      'interaction',
      'frame',
      'milestone',
      'frame',
    ]);
  });

  it('passes on what a loaded page does next, not what it had already reached', async () => {
    const cdp = createFakeCdpTransport();
    showingDocument(cdp, 'loader-now');
    replayOnEnable(cdp, () => {
      lifecycleEvent(cdp, 'DOMContentLoaded', 'loader-now');
      lifecycleEvent(cdp, 'networkAlmostIdle', 'loader-now');
    });

    const { events, stop } = await createFusedStream(cdp, {
      screencast: { viewport },
    });
    lifecycleEvent(cdp, 'networkIdle', 'loader-now');
    await stop();

    expect(
      (await collect(events)).map((e) =>
        e.type === 'milestone' ? `milestone ${e.name}` : e.type,
      ),
    ).toEqual(['navigated', 'milestone networkIdle']);
  });

  it('attaches all three sources to the one transport it was given', async () => {
    const cdp = createFakeCdpTransport();
    await createFusedStream(cdp, { screencast: { viewport } });

    expect(cdp.sentMethods()).toEqual(
      expect.arrayContaining([
        'Page.startScreencast',
        'Page.setLifecycleEventsEnabled',
        'Runtime.addBinding',
        'Page.addScriptToEvaluateOnNewDocument',
        'Runtime.evaluate',
      ]),
    );
    expect(cdp.listenerCount('Page.screencastFrame')).toBe(1);
    expect(cdp.listenerCount('Page.lifecycleEvent')).toBe(1);
    expect(cdp.listenerCount('Runtime.bindingCalled')).toBe(1);
  });

  it('ACKs every frame with its own session id', async () => {
    const cdp = createFakeCdpTransport();
    await createFusedStream(cdp, { screencast: { viewport } });

    screencastFrame(cdp, { sessionId: 41 });
    screencastFrame(cdp, { sessionId: 42 });

    expect(
      cdp.sent
        .filter((c) => c.method === 'Page.screencastFrameAck')
        .map((c) => c.params),
    ).toEqual([{ sessionId: 41 }, { sessionId: 42 }]);
  });

  it('says quiet once nothing has arrived for 250 ms, stamped with that moment', async () => {
    const cdp = createFakeCdpTransport({ startAtMs: 1_000 });
    const { events, stop } = await createFusedStream(cdp, {
      screencast: { viewport },
    });

    screencastFrame(cdp);
    cdp.advance(249);
    screencastFrame(cdp); // at 1249: any event re-arms it
    cdp.advance(5_000); // quiet at 1499, and only once per quiet stretch
    screencastFrame(cdp);
    await stop();
    cdp.advance(5_000); // never after stop

    expect(
      (await collect(events)).map((event) =>
        event.type === 'quiet' ? `quiet ${event.receivedAtMs}` : event.type,
      ),
    ).toEqual(['frame', 'frame', 'quiet 1499', 'frame']);
  });

  it('detaches every source on stop and ends the stream', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.addScriptToEvaluateOnNewDocument', { identifier: 'probe' });
    const { events, stop } = await createFusedStream(cdp, {
      screencast: { viewport },
    });

    await stop();

    expect(cdp.sentMethods()).toEqual(
      expect.arrayContaining([
        'Page.stopScreencast',
        'Page.removeScriptToEvaluateOnNewDocument',
        'Runtime.removeBinding',
      ]),
    );
    expect(cdp.sent).toContainEqual({
      method: 'Page.setLifecycleEventsEnabled',
      params: { enabled: false },
    });
    expect(cdp.listenerCount()).toBe(0);
    expect(await collect(events)).toEqual([]);
  });

  it('detaches the sources that did attach when another fails', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Runtime.addBinding', () => {
      throw new Error('binding refused');
    });

    await expect(
      createFusedStream(cdp, { screencast: { viewport } }),
    ).rejects.toThrow('binding refused');
    expect(cdp.listenerCount()).toBe(0);
    expect(cdp.sentMethods()).toContain('Page.stopScreencast');
  });
});
