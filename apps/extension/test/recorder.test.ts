import { describe, expect, it } from 'vitest';
import { createFakeCdpTransport, type FakeCdpTransport } from '@openuji/cdp/testing';
import type { Clip, ClipWrite } from '@openuji/core';
import type { ClipWorker } from '@openuji/clip-webm';
import type { DetachReason, ExtensionTarget } from '@openuji/host-extension';
import { PROBE_BINDING_NAME } from '@openuji/stream-interaction';
import {
  bindingCalled,
  frameNavigated,
  positionPayload,
  screencastFrame,
  scrollPayload,
} from '../../../packages/cdp/test/events.js';
import type { OpenClips } from '../src/lib/clips';
import type { WorkerMessage } from '../src/lib/protocol';
import { Recorder } from '../src/lib/recorder';

const TAB = { id: 7, title: 'Example', url: 'https://example.com/' };

/** Let the recording's consumer loop catch up with the queued events. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** An attached tab over a fake transport. `endSession` plays Chrome ending it. */
function fakeTab(cdp: FakeCdpTransport) {
  let closedListener: ((reason: DetachReason) => void) | undefined;
  const tab = {
    closed: false,
    endSession: (reason: DetachReason) => closedListener?.(reason),
    target: {
      tabId: TAB.id,
      cdp,
      navigate: async () => {},
      onClosed(listener) {
        closedListener = listener;
        return () => (closedListener = undefined);
      },
      async close() {
        tab.closed = true;
      },
    } satisfies ExtensionTarget,
  };
  return tab;
}

/**
 * A video encoder that encodes nothing: it writes down the clip writes, and on
 * `keep` hands back a clip filed like its capture.
 */
function fakeClips() {
  const clips = { opened: 0, closed: 0, writes: [] as ClipWrite[] };
  const open: OpenClips = async (onClip) => {
    clips.opened += 1;
    const worker: ClipWorker = {
      sink: {
        name: 'fake-clips',
        enqueue: (write) => {
          clips.writes.push(write);
          if (write.type !== 'keep') return;
          const { viewId, entry, documentId, loaderId, url, label } = write.capture;
          const clip: Clip = { viewId, entry, documentId, loaderId, url, label, mimeType: 'video/webm', base64: '', trace: [] };
          onClip(clip);
        },
        drain: async () => {},
      },
      close: async () => {
        clips.closed += 1;
      },
    };
    return worker;
  };
  return { clips, open };
}

function setup() {
  const cdp = createFakeCdpTransport({ startAtMs: 1_000 });
  const tab = fakeTab(cdp);
  const messages: WorkerMessage[] = [];
  const video = fakeClips();
  const recorder = new Recorder(async () => tab.target, (message) => messages.push(message), video.open);
  return { cdp, tab, messages, recorder, clips: video.clips };
}

/** A scroll the default rules record: the page at rest, a jump it reports, its landing. */
function scroll(cdp: FakeCdpTransport): void {
  frameNavigated(cdp, 'loader-a', { url: TAB.url });
  bindingCalled(cdp, PROBE_BINDING_NAME, positionPayload(0)); // the probe starting
  screencastFrame(cdp);
  cdp.advance(300);
  bindingCalled(cdp, PROBE_BINDING_NAME, scrollPayload(600));
  bindingCalled(cdp, PROBE_BINDING_NAME, scrollPayload(600, true));
  cdp.advance(16);
  screencastFrame(cdp);
  cdp.advance(300);
}

/** A page that has painted its first frame. */
function firstFrame(cdp: FakeCdpTransport): void {
  frameNavigated(cdp, 'loader-a', { url: TAB.url });
  screencastFrame(cdp);
}

describe('Recorder', () => {
  it('records the journey, then flushes the resting state and hands the tab back on stop', async () => {
    const { cdp, tab, messages, recorder } = setup();

    await recorder.record(TAB);
    firstFrame(cdp);
    await settle();
    await recorder.stop();

    expect(recorder.captures.map((capture) => capture.label)).toEqual([
      '00-first',
      '99-before-navigation',
    ]);
    expect(messages.map((message) => message.type)).toEqual([
      'snapshot', // recording, empty journey
      'capture',
      'status', // stopping
      'capture',
      'status', // done
    ]);
    expect(recorder.status).toEqual({
      state: 'done',
      tab: TAB,
      startedAtMs: 1_000,
      endedAtMs: 1_000,
      endedBy: 'user',
      droppedFrames: 0,
    });
    expect(tab.closed).toBe(true);
    expect(recorder.cdp).toBeNull();
  });

  it('ends the recording when Chrome closes the tab, keeping the resting state', async () => {
    const { cdp, tab, recorder } = setup();

    await recorder.record(TAB);
    firstFrame(cdp);
    await settle();
    tab.endSession('target_closed');
    await settle();

    expect(recorder.status).toMatchObject({ state: 'done', endedBy: 'tab-closed' });
    expect(recorder.captures.at(-1)?.label).toBe('99-before-navigation');
    expect(tab.closed).toBe(true);
  });

  it('records one tab at a time', async () => {
    const { recorder } = setup();

    await recorder.record(TAB);

    await expect(recorder.record(TAB)).rejects.toThrow('Already recording');
    expect(recorder.status.state).toBe('recording');
  });

  it('stays idle when the tab cannot be attached', async () => {
    const messages: WorkerMessage[] = [];
    const recorder = new Recorder(
      async () => {
        throw new Error('Another debugger is attached to this tab.');
      },
      (message) => messages.push(message),
    );

    await expect(recorder.record(TAB)).rejects.toThrow('Another debugger');
    expect(recorder.status).toEqual({ state: 'idle' });
    expect(messages).toEqual([]);
  });

  it('starts over with an empty journey after reset', async () => {
    const { cdp, messages, recorder } = setup();
    await recorder.record(TAB);
    firstFrame(cdp);
    await settle();
    await recorder.stop();

    recorder.reset();

    expect(recorder.captures).toEqual([]);
    expect(messages.at(-1)).toEqual({
      type: 'snapshot',
      status: { state: 'idle' },
      captures: [],
      clips: [],
    });
  });

  describe('video', () => {
    it('makes none unless asked: no encoder is started', async () => {
      const { cdp, recorder, clips } = setup();

      await recorder.record(TAB);
      scroll(cdp);
      await settle();
      await recorder.stop();

      expect(clips.opened).toBe(0);
      expect(recorder.clips).toEqual([]);
    });

    it("asked for, files each scroll's video with the journey and sends it to the panels", async () => {
      const { cdp, messages, recorder, clips } = setup();

      await recorder.record(TAB, { video: true });
      scroll(cdp);
      await settle();
      await recorder.stop();

      expect(clips.writes.map((w) => w.type)).toEqual(['frame', 'frame', 'keep']);
      expect(recorder.clips.map((c) => `${c.viewId} ${c.label}`)).toEqual(['1 04-post-scroll-01']);
      expect(messages.filter((m) => m.type === 'clip')).toHaveLength(1);
      // The encoder ends after the recording has drained it.
      expect(clips.closed).toBe(1);
      expect(recorder.snapshot()).toMatchObject({ clips: recorder.clips });
    });

    it('starts the next recording, and a reset, with no videos', async () => {
      const { cdp, recorder } = setup();
      await recorder.record(TAB, { video: true });
      scroll(cdp);
      await settle();
      await recorder.stop();

      recorder.reset();

      expect(recorder.clips).toEqual([]);
    });

    it('stays idle, the tab handed back, when the encoder cannot start', async () => {
      const cdp = createFakeCdpTransport({ startAtMs: 1_000 });
      const tab = fakeTab(cdp);
      const recorder = new Recorder(
        async () => tab.target,
        () => {},
        async () => {
          throw new Error('The video encoder failed to start');
        },
      );

      await expect(recorder.record(TAB, { video: true })).rejects.toThrow('video encoder failed');
      expect(recorder.status).toEqual({ state: 'idle' });
      expect(tab.closed).toBe(true);
    });

    it('refuses video where no encoder was given', async () => {
      const cdp = createFakeCdpTransport({ startAtMs: 1_000 });
      const tab = fakeTab(cdp);
      const recorder = new Recorder(async () => tab.target, () => {});

      await expect(recorder.record(TAB, { video: true })).rejects.toThrow('cannot make videos');
      expect(recorder.status).toEqual({ state: 'idle' });
    });
  });
});
