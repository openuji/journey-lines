import { describe, expect, it } from 'vitest';
import { createFakeCdpTransport } from '@openuji/cdp/testing';
import type { CaptureSink, ClipSink, ClipWrite, MilestoneCapture } from '@openuji/core';
import { defaultRules, startRecording } from '@openuji/fused';
import { defaultDocumentRules } from '@openuji/rules-document';
import { defaultInteractionRules } from '@openuji/rules-interaction';
import { PROBE_BINDING_NAME } from '@openuji/stream-probe';
import {
  bindingCalled,
  clickPayload,
  causePayload,
  frameNavigated,
  positionPayload,
  scrollPayload,
  lifecycleEvent,
  navigatedWithinDocument,
  replayOnEnable,
  screencastFrame,
  showingDocument,
} from '../../cdp/test/events.js';

class MemorySink implements CaptureSink {
  public readonly name = 'memory';
  public readonly captures: MilestoneCapture[] = [];
  public drained = 0;

  constructor(private readonly failDrain = false) {}

  public enqueue(capture: MilestoneCapture): void {
    this.captures.push(capture);
  }

  public async drain(): Promise<void> {
    this.drained += 1;
    if (this.failDrain) throw new Error('disk full');
  }
}

/** Records every clip write; `onDrain` runs when the recording drains it. */
class MemoryClips implements ClipSink {
  public readonly name = 'memory-clips';
  public readonly writes: ClipWrite[] = [];

  constructor(private readonly onDrain: () => void = () => {}) {}

  public enqueue(write: ClipWrite): void {
    this.writes.push(write);
  }

  public async drain(): Promise<void> {
    this.onDrain();
  }
}

/** Let the recording's consumer loop catch up with the queued events. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const screencast = { viewport: { width: 1280, height: 800 } };

describe('startRecording', () => {
  it('runs CDP events through the default rules into the sinks', async () => {
    const cdp = createFakeCdpTransport();
    const sink = new MemorySink();
    const recording = await startRecording(cdp, { sinks: [sink], screencast });

    frameNavigated(cdp, 'loader-a');
    screencastFrame(cdp, { data: 'Zmlyc3Q=' });
    lifecycleEvent(cdp, 'DOMContentLoaded', 'loader-a');
    screencastFrame(cdp);
    lifecycleEvent(cdp, 'networkAlmostIdle', 'loader-a');
    screencastFrame(cdp, { data: 'c2V0dGxlZA==' });
    bindingCalled(cdp, PROBE_BINDING_NAME, clickPayload('button#go'));
    screencastFrame(cdp, { data: 'YWZ0ZXI=' });
    await settle();
    await recording.stop();

    expect(sink.captures.map((c) => c.label)).toEqual([
      '00-first',
      '01-domcontentloaded',
      '02-settled',
      '10-pre-click-01',
      '11-post-click-01',
      '99-before-navigation',
    ]);

    const byLabel = new Map(sink.captures.map((c) => [c.label, c]));
    expect(byLabel.get('00-first')?.frame.base64).toBe('Zmlyc3Q=');
    // Pre-click is the resting frame *before* the click; post-click the one after.
    expect(byLabel.get('10-pre-click-01')?.frame.base64).toBe('c2V0dGxlZA==');
    expect(byLabel.get('11-post-click-01')?.frame.base64).toBe('YWZ0ZXI=');
    expect(byLabel.get('11-post-click-01')?.domTarget?.selector).toBe('button#go');
    expect(sink.drained).toBe(1);
  });

  it('records an SPA route change as a view of its own', async () => {
    const cdp = createFakeCdpTransport();
    const sink = new MemorySink();
    const recording = await startRecording(cdp, { sinks: [sink], screencast });

    frameNavigated(cdp, 'loader-a', { url: 'https://app.example/' });
    screencastFrame(cdp, { data: 'aG9tZQ==' });
    bindingCalled(cdp, PROBE_BINDING_NAME, clickPayload('a#inbox'));
    navigatedWithinDocument(cdp, 'https://app.example/inbox');
    screencastFrame(cdp, { data: 'aW5ib3g=' });
    navigatedWithinDocument(cdp, 'https://app.example/inbox?unread=1');
    bindingCalled(cdp, PROBE_BINDING_NAME, clickPayload('button#compose'));
    screencastFrame(cdp);
    await settle();
    await recording.stop();

    expect(sink.captures.map((c) => `${c.viewId} ${c.url} ${c.label}`)).toEqual([
      '1 https://app.example/ 00-first',
      '1 https://app.example/ 10-pre-click-01',
      '1 https://app.example/ 99-before-navigation',
      // One frame, two captures, in rule order: document rules come first.
      '2 https://app.example/inbox 00-first',
      '1 https://app.example/ 11-post-click-01',
      // A query-only update keeps the view, but no stale URL.
      '2 https://app.example/inbox?unread=1 10-pre-click-01',
      '2 https://app.example/inbox?unread=1 11-post-click-01',
      '2 https://app.example/inbox?unread=1 99-before-navigation',
    ]);
    const byLabel = (viewId: number, label: string) =>
      sink.captures.find((c) => c.viewId === viewId && c.label === label);
    // What the route-changing click did is the new route's first frame.
    expect(byLabel(1, '11-post-click-01')?.frame.base64).toBe('aW5ib3g=');
    expect(byLabel(2, '00-first')?.frame.base64).toBe('aW5ib3g=');
    expect(new Set(sink.captures.map((c) => c.documentId))).toEqual(new Set([1]));
  });

  it('attached to an already-loaded page, does not capture milestones it never saw', async () => {
    const cdp = createFakeCdpTransport();
    showingDocument(cdp, 'loader-now');
    replayOnEnable(cdp, () => {
      lifecycleEvent(cdp, 'commit', 'loader-now');
      lifecycleEvent(cdp, 'DOMContentLoaded', 'loader-now');
      lifecycleEvent(cdp, 'load', 'loader-now');
      lifecycleEvent(cdp, 'networkAlmostIdle', 'loader-now');
    });

    const sink = new MemorySink();
    const recording = await startRecording(cdp, { sinks: [sink], screencast });

    screencastFrame(cdp);
    screencastFrame(cdp);
    await settle();
    await recording.stop();

    // Were Chromium's report of past milestones let through, these frames would
    // also be labelled `01-domcontentloaded` and `02-settled` — moments that
    // happened before the recording started.
    expect(sink.captures.map((c) => c.label)).toEqual([
      '00-first',
      '99-before-navigation',
    ]);
  });

  it('captures 01 and 02 on a page that stops painting once the stream goes quiet', async () => {
    const cdp = createFakeCdpTransport();
    const sink = new MemorySink();
    const recording = await startRecording(cdp, { sinks: [sink], screencast });

    frameNavigated(cdp, 'loader-a');
    lifecycleEvent(cdp, 'DOMContentLoaded', 'loader-a');
    screencastFrame(cdp, { data: 'cGFpbnRlZA==' });
    cdp.advance(500);
    lifecycleEvent(cdp, 'networkAlmostIdle', 'loader-a');
    // Chrome sends nothing more.
    cdp.advance(300);
    await settle();

    // Before Stop: the stream's quiet captured it.
    expect(sink.captures.map((c) => `${c.label} ${c.frame.base64}`)).toEqual([
      '00-first cGFpbnRlZA==',
      '01-domcontentloaded cGFpbnRlZA==',
      '02-settled cGFpbnRlZA==',
    ]);

    await recording.stop();
  });

  it('ends a scroll on a page that stops painting once the stream goes quiet', async () => {
    const cdp = createFakeCdpTransport();
    const sink = new MemorySink();
    const recording = await startRecording(cdp, { sinks: [sink], screencast });

    frameNavigated(cdp, 'loader-a');
    bindingCalled(cdp, PROBE_BINDING_NAME, positionPayload(0)); // where the page is
    screencastFrame(cdp, { data: 'dG9w' });
    cdp.advance(300);
    bindingCalled(cdp, PROBE_BINDING_NAME, causePayload('wheel'));
    bindingCalled(cdp, PROBE_BINDING_NAME, scrollPayload(600));
    bindingCalled(cdp, PROBE_BINDING_NAME, scrollPayload(600, true));
    cdp.advance(16);
    // The frame's own offset stays stale; the page said where it is.
    screencastFrame(cdp, { scrollY: 0, data: 'bGFuZGVk' });
    // Chrome sends nothing more.
    cdp.advance(300);
    await settle();

    // Before Stop: the stream's quiet ended it.
    expect(sink.captures.map((c) => c.label)).toEqual([
      '00-first',
      '03-pre-scroll-01',
      '04-post-scroll-01',
    ]);
    const [, pre, post] = sink.captures;
    expect(pre?.frame.base64).toBe('dG9w');
    expect(post?.frame.base64).toBe('bGFuZGVk');

    await recording.stop();
  });

  it('drops a scroll still open at Stop: it has not settled', async () => {
    const cdp = createFakeCdpTransport();
    const sink = new MemorySink();
    const recording = await startRecording(cdp, { sinks: [sink], screencast });

    frameNavigated(cdp, 'loader-a');
    screencastFrame(cdp);
    cdp.advance(300);
    bindingCalled(cdp, PROBE_BINDING_NAME, causePayload('wheel'));
    bindingCalled(cdp, PROBE_BINDING_NAME, scrollPayload(600)); // no scrollend yet
    screencastFrame(cdp);
    await settle();
    await recording.stop();

    expect(sink.captures.map((c) => c.label)).toEqual(['00-first', '99-before-navigation']);
  });

  it('runs every rule of both categories once', () => {
    expect(new Set(defaultRules)).toEqual(
      new Set([...defaultDocumentRules, ...defaultInteractionRules]),
    );
    expect(defaultRules).toHaveLength(
      defaultDocumentRules.length + defaultInteractionRules.length,
    );
  });

  it('is idempotent on stop', async () => {
    const cdp = createFakeCdpTransport();
    const sink = new MemorySink();
    const recording = await startRecording(cdp, { sinks: [sink], screencast });

    frameNavigated(cdp, 'loader-a');
    screencastFrame(cdp);
    await settle();

    await Promise.all([recording.stop(), recording.stop()]);
    await recording.stop();

    expect(
      sink.captures.filter((c) => c.label === '99-before-navigation'),
    ).toHaveLength(1);
    expect(sink.drained).toBe(1);
  });

  it('rejects stop when a sink fails to drain, after tearing the streams down', async () => {
    const cdp = createFakeCdpTransport();
    const recording = await startRecording(cdp, {
      sinks: [new MemorySink(true)],
      screencast,
    });

    await expect(recording.stop()).rejects.toThrow('disk full');
    expect(cdp.listenerCount()).toBe(0);
  });

  describe('clips', () => {
    /** A scroll the default rules record: the page at rest, a jump it reports, its landing. */
    const scroll = (cdp: ReturnType<typeof createFakeCdpTransport>): void => {
      frameNavigated(cdp, 'loader-a');
      bindingCalled(cdp, PROBE_BINDING_NAME, positionPayload(0)); // the probe starting
      screencastFrame(cdp, { data: 'dG9w' });
      cdp.advance(300);
      bindingCalled(cdp, PROBE_BINDING_NAME, causePayload('wheel'));
      bindingCalled(cdp, PROBE_BINDING_NAME, scrollPayload(600));
      bindingCalled(cdp, PROBE_BINDING_NAME, scrollPayload(600, true));
      cdp.advance(16);
      screencastFrame(cdp, { data: 'bGFuZGVk' });
      cdp.advance(300);
    };

    it('hands the scroll rule\'s clip writes to the clip sink, in order', async () => {
      const cdp = createFakeCdpTransport();
      const clips = new MemoryClips();
      const recording = await startRecording(cdp, { sinks: [new MemorySink()], clips, screencast });

      scroll(cdp);
      await settle();
      await recording.stop();

      expect(clips.writes.map((w) => (w.type === 'frame' ? `frame ${w.frame.base64}` : w.type))).toEqual([
        'frame dG9w',
        'frame bGFuZGVk',
        'keep',
      ]);
    });

    it('records exactly as before without a clip sink', async () => {
      const withClips = new MemorySink();
      const without = new MemorySink();

      for (const [sink, clips] of [[withClips, new MemoryClips()], [without, undefined]] as const) {
        const cdp = createFakeCdpTransport();
        const recording = await startRecording(cdp, { sinks: [sink], screencast, ...(clips ? { clips } : {}) });
        scroll(cdp);
        await settle();
        await recording.stop();
      }

      expect(without.captures).toEqual(withClips.captures);
    });

    it('drains the clip sink before the capture sinks: a finished clip may still hand them a file', async () => {
      const order: string[] = [];
      const sink = new MemorySink();
      const drainSink = sink.drain.bind(sink);
      sink.drain = async () => {
        order.push('sinks');
        await drainSink();
      };
      const cdp = createFakeCdpTransport();
      const recording = await startRecording(cdp, {
        sinks: [sink],
        clips: new MemoryClips(() => order.push('clips')),
        screencast,
      });

      await recording.stop();

      expect(order).toEqual(['clips', 'sinks']);
    });

    it('reports a failing clip sink and a failing capture sink together', async () => {
      const cdp = createFakeCdpTransport();
      const clips = new MemoryClips(() => {
        throw new Error('encoder gone');
      });
      const recording = await startRecording(cdp, { sinks: [new MemorySink(true)], clips, screencast });

      await expect(recording.stop()).rejects.toThrow(/encoder gone[\s\S]*disk full/);
    });
  });
});
