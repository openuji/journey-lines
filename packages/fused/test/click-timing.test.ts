import { describe, expect, it } from 'vitest';
import { createFakeCdpTransport, createFakeTabHost } from '@journey-lines/cdp/testing';
import type { ClipWrite, MilestoneCapture } from '@journey-lines/core';
import { defaultRules, recordActiveTab, startRecording, type RecordingOptions } from '@journey-lines/fused';
import { PROBE_BINDING_NAME } from '@journey-lines/stream-probe';
import { bindingCalled, clickPayload, frameNavigated, screencastFrame } from '../../cdp/test/events.js';

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function setup(mode: 'transport' | 'active-tab', overrides: Partial<RecordingOptions> = {}) {
  const captures: MilestoneCapture[] = [];
  const writes: ClipWrite[] = [];
  const options: RecordingOptions = {
    sinks: [{ name: 'captures', enqueue: (capture) => { captures.push(capture); }, drain: async () => {} }],
    clips: { name: 'clips', enqueue: (write) => { writes.push(write); }, drain: async () => {} },
    screencast: { viewport: { width: 1280, height: 800 } },
    click: { quietAfterMs: 1000, stillMovingMs: 5000 },
    ...overrides,
  };
  const host = createFakeTabHost<number>();
  const transport = createFakeCdpTransport();
  const recording = mode === 'transport'
    ? await startRecording(transport, options)
    : await recordActiveTab(host, 1, options);
  const cdp = mode === 'transport' ? transport : host.session(1).cdp;
  frameNavigated(cdp, 'tour');
  screencastFrame(cdp, { data: 'card-A' });
  cdp.advance(100);
  bindingCalled(cdp, PROBE_BINDING_NAME, clickPayload('button#next'));
  return { cdp, recording, captures, writes, options };
}

describe.each(['transport', 'active-tab'] as const)('click timing through %s recording', (mode) => {
  it('keeps fade-out, a 600 ms gap, and fade-in in one clip ending at the new card', async () => {
    const { cdp, recording, captures, writes, options } = await setup(mode);
    try {
      // Changing the caller's options cannot change the running rule.
      Object.assign(options.click!, { quietAfterMs: 250 });
      cdp.advance(200);
      screencastFrame(cdp, { data: 'faded-out' });
      cdp.advance(600);
      await settle();
      expect(captures.some((c) => c.label.startsWith('11-'))).toBe(false);
      screencastFrame(cdp, { data: 'card-B-fading-in' });
      cdp.advance(200);
      screencastFrame(cdp, { data: 'card-B-visible' });
      cdp.advance(999);
      await settle();
      expect(writes).toEqual([]);
      cdp.advance(1);
      await settle();
      const pair = captures.filter((c) => c.label.startsWith('1'));
      expect(pair.map((c) => c.frame.base64)).toEqual(['card-A', 'card-B-visible']);
      const frames = writes.flatMap((w) => w.type === 'frame' ? [w.frame] : []);
      expect(frames.map((f) => f.base64)).toEqual(['card-A', 'faded-out', 'card-B-fading-in', 'card-B-visible']);
      expect(frames[0]).toBe(pair[0]?.frame);
      expect(frames.at(-1)).toBe(pair[1]?.frame);
      expect(writes.at(-1)).toMatchObject({ type: 'keep', capture: pair[1] });
      cdp.advance(10_000);
      await settle();
      expect(captures.filter((c) => c.label.startsWith('11-'))).toHaveLength(1);
    } finally { await recording.stop(); }
  });

  it('finishes a page that stops painting without a further frame or Stop', async () => {
    const { cdp, recording, captures } = await setup(mode);
    try {
      cdp.advance(10);
      screencastFrame(cdp, { data: 'changed-once' });
      cdp.advance(250);
      await settle();
      expect(captures.some((c) => c.label.startsWith('11-'))).toBe(false);
      cdp.advance(750);
      await settle();
      expect(captures.find((c) => c.label.startsWith('11-'))?.frame.base64).toBe('changed-once');
    } finally { await recording.stop(); }
  });

  it.each([2000, 5000])('limits continuously moving responses using the configured %i ms maximum', async (stillMovingMs) => {
    const { cdp, recording, captures, writes } = await setup(mode, { click: { quietAfterMs: 1000, stillMovingMs } });
    try {
      for (let i = 1; i <= 31; i++) {
        cdp.advance(100);
        screencastFrame(cdp, { data: i === 31 ? 'card-B-visible' : `moving-${i}` });
      }
      cdp.advance(1000);
      await settle();
      const post = captures.find((c) => c.label.startsWith('11-'))!;
      expect(post.frame.base64).toBe(stillMovingMs === 2000 ? 'moving-19' : 'card-B-visible');
      expect(post.detail).toContain(stillMovingMs === 2000 ? 'observation limit reached' : 'came to rest');
      expect(writes.filter((w) => w.type === 'frame').at(-1)).toMatchObject({ frame: post.frame });
    } finally { await recording.stop(); }
  });

  it('preserves explicitly supplied rules over click configuration', async () => {
    const { cdp, recording, captures } = await setup(mode, { rules: defaultRules });
    try {
      screencastFrame(cdp, { data: 'faded-out' });
      cdp.advance(250);
      await settle();
      expect(captures.find((c) => c.label.startsWith('11-'))?.frame.base64).toBe('faded-out');
    } finally { await recording.stop(); }
  });
});

it('rejects invalid click timing before either recording entry point attaches', async () => {
  const host = createFakeTabHost<number>();
  const cdp = createFakeCdpTransport();
  const options = { sinks: [], click: { quietAfterMs: 3000, stillMovingMs: 2000 } };
  await expect(startRecording(cdp, options)).rejects.toThrow('at least as long');
  await expect(recordActiveTab(host, 1, options)).rejects.toThrow('at least as long');
  expect(host.attaches).toEqual([]);
  expect(cdp.sent).toEqual([]);
});
