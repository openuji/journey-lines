import { describe, expect, it } from 'vitest';
import { createFakeCdpTransport } from '@openuji/cdp/testing';
import { createCompositorStream } from '@openuji/stream-compositor';
import { collect, screencastFrame } from '../../cdp/test/events.js';

function startScreencastParams(cdp: ReturnType<typeof createFakeCdpTransport>) {
  return cdp.sent.find((command) => command.method === 'Page.startScreencast')
    ?.params;
}

describe('createCompositorStream (standalone)', () => {
  it('emits a frame per screencastFrame and ACKs each with its session id', async () => {
    const cdp = createFakeCdpTransport({ startAtMs: 5_000 });
    const { frames, stop } = await createCompositorStream(cdp, {
      viewport: { width: 1280, height: 800 },
    });

    screencastFrame(cdp, { sessionId: 7, data: 'AAAA' });
    cdp.advance(16);
    screencastFrame(cdp, { sessionId: 8, scrollY: 120 });
    await stop();

    const out = await collect(frames);
    expect(out.map((f) => [f.index, f.scrollY, f.base64])).toEqual([
      [1, 0, 'AAAA'],
      [2, 120, 'cG5n'],
    ]);
    // Receipt time comes from the transport's clock; Chromium's swap time
    // (epoch seconds) keeps its own field.
    expect(out.map((f) => f.receivedAtMs)).toEqual([5_000, 5_016]);
    expect(out[0]?.swapTimeMs).toBe(1_700_000_000_000);

    const acks = cdp.sent.filter((c) => c.method === 'Page.screencastFrameAck');
    expect(acks.map((c) => c.params)).toEqual([{ sessionId: 7 }, { sessionId: 8 }]);
  });

  it('bounds the screencast by the viewport the host knows', async () => {
    const cdp = createFakeCdpTransport();
    await createCompositorStream(cdp, { viewport: { width: 1024, height: 768 } });

    expect(cdp.sentMethods()).not.toContain('Page.getLayoutMetrics');
    expect(startScreencastParams(cdp)).toMatchObject({
      format: 'png',
      maxWidth: 1024,
      maxHeight: 768,
    });
  });

  it('asks CDP for the viewport when the host does not know it', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.getLayoutMetrics', {
      cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 900, clientHeight: 600 },
    } as never);

    await createCompositorStream(cdp);

    expect(startScreencastParams(cdp)).toMatchObject({
      maxWidth: 900,
      maxHeight: 600,
    });
  });

  it('lets explicit maxWidth/maxHeight override the viewport', async () => {
    const cdp = createFakeCdpTransport();
    await createCompositorStream(cdp, {
      viewport: { width: 1280, height: 800 },
      maxWidth: 640,
    });

    expect(startScreencastParams(cdp)).toMatchObject({
      maxWidth: 640,
      maxHeight: 800,
    });
  });

  it('stops the screencast, unsubscribes and ends — but leaves the transport alone', async () => {
    const cdp = createFakeCdpTransport();
    const { frames, stop } = await createCompositorStream(cdp, {
      viewport: { width: 1280, height: 800 },
    });

    await stop();
    screencastFrame(cdp); // after stop: nobody is listening

    expect(cdp.sentMethods()).toContain('Page.stopScreencast');
    expect(cdp.listenerCount()).toBe(0);
    expect(await collect(frames)).toEqual([]);
  });

  it('asks for one frame in flight, keeping the newest rather than dropping it', async () => {
    const cdp = createFakeCdpTransport();
    await createCompositorStream(cdp, { viewport: { width: 1280, height: 800 } });

    expect(startScreencastParams(cdp)).toMatchObject({ maxFramesInFlight: 1, sendLastFrame: true });
  });

  it("says when a frame was drawn, where Chrome does (Chrome 156's monotonicTimestamp)", async () => {
    const cdp = createFakeCdpTransport();
    const { frames, stop } = await createCompositorStream(cdp, { viewport: { width: 1280, height: 800 } });

    screencastFrame(cdp, { monotonicTimestamp: 584_119.25 });
    screencastFrame(cdp);
    await stop();

    expect((await collect(frames)).map((f) => f.drawnAtMs)).toEqual([584_119_250, undefined]);
  });

  it('leaves out a frame drawn before one already passed on, acks it, and says so', async () => {
    const cdp = createFakeCdpTransport();
    const outOfOrder: [number, number][] = [];
    const { frames, stop } = await createCompositorStream(cdp, {
      viewport: { width: 1280, height: 800 },
      onOutOfOrder: (frame, total) => outOfOrder.push([frame.index, total]),
    });

    screencastFrame(cdp, { sessionId: 1, monotonicTimestamp: 10.016 });
    screencastFrame(cdp, { sessionId: 2, monotonicTimestamp: 10.008 }); // drawn earlier, arrived later
    screencastFrame(cdp, { sessionId: 3, monotonicTimestamp: 10.024 });
    await stop();

    expect((await collect(frames)).map((f) => f.index)).toEqual([1, 3]);
    expect(outOfOrder).toEqual([[2, 1]]);
    const acks = cdp.sent.filter((c) => c.method === 'Page.screencastFrameAck');
    expect(acks.map((c) => c.params)).toEqual([{ sessionId: 1 }, { sessionId: 2 }, { sessionId: 3 }]);
  });
});
