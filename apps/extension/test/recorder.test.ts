import { describe, expect, it } from 'vitest';
import { createFakeTabHost, type FakeCdpTransport } from '@openuji/cdp/testing';
import type { Clip, ClipWrite } from '@openuji/core';
import type { ClipWorker } from '@openuji/clip-webm';
import { PROBE_BINDING_NAME } from '@openuji/stream-probe';
import {
  bindingCalled,
  causePayload,
  clickPayload,
  frameNavigated,
  positionPayload,
  pressPayload,
  screencastFrame,
  scrollPayload,
} from '../../../packages/cdp/test/events.js';
import type { OpenClips } from '../src/lib/clips';
import { MemoryRecordingStore, type RecordingStore } from '../src/lib/recording-store';
import type { TabSummary, WorkerMessage } from '../src/lib/protocol';
import { Recorder, type DescribeTab } from '../src/lib/recorder';

const TAB: TabSummary = { id: 7, windowId: 1, title: 'Example', url: 'https://example.com/' };
const OTHER: TabSummary = { id: 8, windowId: 1, title: 'Other', url: 'https://example.com/other' };

/** Let the recording's consumer loop catch up with the queued events. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

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

/** A window of tabs played by a fake host; `cdp()` is the recorded tab's transport. */
function setup(options: { encoder?: boolean; describe?: DescribeTab; store?: RecordingStore } = {}) {
  const host = createFakeTabHost<number>({ startAtMs: 1_000 });
  const windows: number[] = [];
  const messages: WorkerMessage[] = [];
  const video = fakeClips();
  const store = options.store ?? new MemoryRecordingStore();
  const recorder = new Recorder(
    (windowId) => {
      windows.push(windowId);
      return host;
    },
    options.describe ?? (async (tabId) => (tabId === OTHER.id ? OTHER : TAB)),
    (message) => messages.push(message),
    options.encoder === false ? undefined : video.open,
    store,
  );
  const cdp = (tabId = TAB.id): FakeCdpTransport => host.session(tabId).cdp;
  return { host, windows, cdp, messages, recorder, clips: video.clips, store };
}

/** A scroll the default rules record: the page at rest, a jump it reports, its landing. */
function scroll(cdp: FakeCdpTransport): void {
  frameNavigated(cdp, 'loader-a', { url: TAB.url });
  bindingCalled(cdp, PROBE_BINDING_NAME, positionPayload(0)); // the probe starting
  screencastFrame(cdp);
  cdp.advance(300);
  bindingCalled(cdp, PROBE_BINDING_NAME, causePayload('wheel'));
  bindingCalled(cdp, PROBE_BINDING_NAME, scrollPayload(600));
  bindingCalled(cdp, PROBE_BINDING_NAME, scrollPayload(600, true));
  cdp.advance(16);
  screencastFrame(cdp);
  cdp.advance(300);
}

/** A click on a page that responds already on the press, as flatpickr does: down, a new picture, the click. */
function clickOnce(cdp: FakeCdpTransport): void {
  frameNavigated(cdp, 'loader-a', { url: TAB.url });
  screencastFrame(cdp);
  cdp.advance(300);
  bindingCalled(cdp, PROBE_BINDING_NAME, pressPayload('t-1', 1_000));
  cdp.advance(16);
  screencastFrame(cdp);
  cdp.advance(60);
  bindingCalled(cdp, PROBE_BINDING_NAME, clickPayload('button#next', { pressId: 't-1', trusted: true }));
  cdp.advance(300);
}

/** A page that has painted its first frame. */
function firstFrame(cdp: FakeCdpTransport, loaderId = 'loader-a'): void {
  frameNavigated(cdp, loaderId, { url: TAB.url });
  screencastFrame(cdp);
}

describe('Recorder', () => {
  it('records the journey, then flushes the resting state and hands the tab back on stop', async () => {
    const { host, windows, cdp, messages, recorder } = setup();

    await recorder.record(TAB);
    firstFrame(cdp());
    await settle();
    await recorder.stop();

    expect(windows).toEqual([TAB.windowId]);
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
    expect(recorder.status).toMatchObject({
      state: 'done',
      tab: TAB,
      startedAtMs: 1_000,
      endedAtMs: 1_000,
      endedBy: 'user',
      droppedFrames: 0,
    });
    expect(recorder.status.state === 'done' && recorder.status.sessionId).toMatch(/^ses_/);
    expect(host.session(TAB.id).closed).toBe(true);
    expect(recorder.cdp).toBeNull();
  });

  it('follows the active tab, and tells the panels what it does with it', async () => {
    const { host, cdp, recorder, store } = setup();
    await recorder.record(TAB);
    firstFrame(cdp());
    host.hold(OTHER.id);

    host.activate(OTHER.id);
    await settle();
    expect(recorder.status).toMatchObject({ active: { tab: OTHER, state: 'attaching' } });

    host.settle(OTHER.id);
    await settle();
    expect(recorder.status).toMatchObject({ active: { tab: OTHER, state: 'recording' } });
    expect(recorder.cdp).toBe(cdp(OTHER.id));

    firstFrame(cdp(OTHER.id), 'loader-b');
    await settle();
    await recorder.stop();
    expect(recorder.captures.map((c) => `${c.viewId} ${c.entry} ${c.label}`)).toEqual([
      '1 load 00-first',
      '1 load 99-before-navigation',
      '2 tab 00-first',
      '2 tab 99-before-navigation',
    ]);
    const sessionId = recorder.status.state === 'done' ? recorder.status.sessionId : undefined;
    const stored = sessionId ? await store.get(sessionId) : null;
    expect(stored?.items.flatMap((item) => item.kind === 'capture' ? [item.capture.entry] : []))
      .toEqual(['load', 'load', 'tab', 'tab']);
  });

  it('shows the latest status only: a description that arrives after a newer status is dropped', async () => {
    let describeOther = (): void => {};
    const { host, recorder } = setup({
      describe: (tabId) =>
        tabId === OTHER.id
          ? new Promise((resolve) => (describeOther = () => resolve(OTHER)))
          : Promise.resolve(TAB),
    });
    await recorder.record(TAB);
    host.hold(OTHER.id);

    host.activate(OTHER.id); // described slowly
    host.activate(TAB.id); // and left before that description arrives
    await settle();
    describeOther();
    await settle();

    expect(recorder.status).toMatchObject({ active: { tab: TAB, state: 'recording' } });
  });

  it('says so when the active tab cannot be recorded', async () => {
    const { host, recorder } = setup();
    await recorder.record(TAB);
    host.refuse(OTHER.id);

    host.activate(OTHER.id);
    await settle();

    expect(recorder.status).toMatchObject({ state: 'recording', active: { tab: OTHER, state: 'refused' } });
  });

  it('ends the recording when its window closes, keeping the resting state', async () => {
    const { host, cdp, recorder } = setup();

    await recorder.record(TAB);
    firstFrame(cdp());
    await settle();
    host.gone();
    await settle();

    expect(recorder.status).toMatchObject({ state: 'done', endedBy: 'window-closed' });
    expect(recorder.captures.at(-1)?.label).toBe('99-before-navigation');
    expect(host.session(TAB.id).closed).toBe(true);
  });

  it('ends the recording when the person cancels debugging in Chrome', async () => {
    const { host, recorder } = setup();

    await recorder.record(TAB);
    host.session(TAB.id).end('revoked');
    await settle();

    expect(recorder.status).toMatchObject({ state: 'done', endedBy: 'debugging-cancelled' });
  });

  it('records one tab at a time', async () => {
    const { recorder } = setup();

    await recorder.record(TAB);

    await expect(recorder.record(TAB)).rejects.toThrow('Already recording');
    expect(recorder.status.state).toBe('recording');
  });

  it('stays idle when the tab cannot be attached', async () => {
    const { host, messages, recorder } = setup();
    host.refuse(TAB.id);

    await expect(recorder.record(TAB)).rejects.toThrow('chrome://');
    expect(recorder.status).toEqual({ state: 'idle' });
    expect(messages).toEqual([]);
  });

  it('starts over with an empty journey after reset', async () => {
    const { cdp, messages, recorder, store } = setup();
    await recorder.record(TAB);
    firstFrame(cdp());
    await settle();
    await recorder.stop();
    const sessionId = recorder.status.state === 'done' ? recorder.status.sessionId : undefined;

    recorder.reset();

    expect(recorder.captures).toEqual([]);
    expect(messages.at(-1)).toEqual({
      type: 'snapshot',
      status: { state: 'idle' },
      captures: [],
      clips: [],
    });
    expect(sessionId && (await store.get(sessionId))?.items.length).toBeGreaterThan(0);
  });

  it('finishes cleanup without opening a report when its output store fails', async () => {
    const store: RecordingStore = {
      begin: async () => 'ses_failed',
      appendCapture: () => {},
      appendClip: () => {},
      finish: async () => { throw new Error('output failed'); },
      discard: async () => {},
      get: async () => null,
    };
    const { cdp, host, recorder } = setup({ encoder: false, store });
    await recorder.record(TAB);
    firstFrame(cdp());
    await settle();

    await expect(recorder.stop()).rejects.toThrow('output failed');
    expect(recorder.status).toMatchObject({ state: 'done' });
    expect(recorder.status.state === 'done' && recorder.status.sessionId).toBeUndefined();
    expect(host.session(TAB.id).closed).toBe(true);
  });

  describe('video', () => {
    it('makes none unless asked: no encoder is started', async () => {
      const { cdp, recorder, clips } = setup();

      await recorder.record(TAB);
      scroll(cdp());
      await settle();
      await recorder.stop();

      expect(clips.opened).toBe(0);
      expect(recorder.clips).toEqual([]);
    });

    it("asked for, files each scroll's video with the journey and sends it to the panels", async () => {
      const { cdp, messages, recorder, clips } = setup();

      await recorder.record(TAB, { video: true });
      scroll(cdp());
      await settle();
      await recorder.stop();

      expect(clips.writes.map((w) => w.type)).toEqual(['frame', 'frame', 'keep']);
      expect(recorder.clips.map((c) => `${c.viewId} ${c.label}`)).toEqual(['1 04-post-scroll-01']);
      expect(messages.filter((m) => m.type === 'clip')).toHaveLength(1);
      // The encoder ends after the recording has drained it.
      expect(clips.closed).toBe(1);
      expect(recorder.snapshot()).toMatchObject({ clips: recorder.clips });
    });

    it("asked for, files each click's video under its 11", async () => {
      const { cdp, recorder, clips } = setup();

      await recorder.record(TAB, { video: true });
      clickOnce(cdp());
      await settle();
      await recorder.stop();

      expect(clips.writes.map((w) => w.type)).toEqual(['frame', 'frame', 'keep']);
      expect(recorder.clips.map((c) => `${c.viewId} ${c.label}`)).toEqual(['1 11-post-click-01']);
    });

    it('starts the next recording, and a reset, with no videos', async () => {
      const { cdp, recorder } = setup();
      await recorder.record(TAB, { video: true });
      scroll(cdp());
      await settle();
      await recorder.stop();

      recorder.reset();

      expect(recorder.clips).toEqual([]);
    });

    it('stays idle, the tab untouched, when the encoder cannot start', async () => {
      const host = createFakeTabHost<number>();
      const recorder = new Recorder(
        () => host,
        async () => TAB,
        () => {},
        async () => {
          throw new Error('The video encoder failed to start');
        },
      );

      await expect(recorder.record(TAB, { video: true })).rejects.toThrow('video encoder failed');
      expect(recorder.status).toEqual({ state: 'idle' });
      expect(host.attaches).toEqual([]);
    });

    it('refuses video where no encoder was given', async () => {
      const { recorder } = setup({ encoder: false });

      await expect(recorder.record(TAB, { video: true })).rejects.toThrow('cannot make videos');
      expect(recorder.status).toEqual({ state: 'idle' });
    });
  });
});
