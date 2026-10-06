import { describe, expect, it } from 'vitest';
import { createFakeCdpTransport, type FakeCdpTransport } from '@openuji/cdp/testing';
import type { DetachReason, ExtensionTarget } from '@openuji/host-extension';
import { frameNavigated, screencastFrame } from '../../../packages/cdp/test/events.js';
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

function setup() {
  const cdp = createFakeCdpTransport({ startAtMs: 1_000 });
  const tab = fakeTab(cdp);
  const messages: WorkerMessage[] = [];
  const recorder = new Recorder(async () => tab.target, (message) => messages.push(message));
  return { cdp, tab, messages, recorder };
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
    expect(messages.at(-1)).toEqual({ type: 'snapshot', status: { state: 'idle' }, captures: [] });
  });
});
