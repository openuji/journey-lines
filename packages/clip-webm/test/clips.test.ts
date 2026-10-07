import { describe, expect, it } from 'vitest';
import type { Clip, ClipWrite, CompositorFrame, MilestoneCapture } from '@openuji/core';
import {
  clipSinkOver,
  serveClips,
  type Channel,
  type ClipEncoder,
  type FromEncoder,
  type ToEncoder,
} from '@openuji/clip-webm';

/** Two ends of a channel; messages arrive a task later, as across a worker. */
function channelPair(): [Channel<FromEncoder, ToEncoder>, Channel<ToEncoder, FromEncoder>] {
  const listeners = { recorder: new Set<(m: FromEncoder) => void>(), encoder: new Set<(m: ToEncoder) => void>() };
  const deliver = <T>(to: Set<(m: T) => void>, message: T): void => {
    setTimeout(() => to.forEach((on) => on(structuredClone(message))), 0);
  };
  return [
    {
      post: (m) => deliver(listeners.encoder, m),
      listen: (on) => (listeners.recorder.add(on), () => listeners.recorder.delete(on)),
    },
    {
      post: (m) => deliver(listeners.recorder, m),
      listen: (on) => (listeners.encoder.add(on), () => listeners.encoder.delete(on)),
    },
  ];
}

/** An encoder that writes down what it was given; its "file" says so. */
function fakeEncoders(failOn?: string) {
  const log: string[] = [];
  let opened = 0;
  const open = (): ClipEncoder => {
    const n = ++opened;
    const shown: string[] = [];
    return {
      add: async (png, atMs) => {
        const text = new TextDecoder().decode(png);
        if (text === failOn) throw new Error(`cannot decode ${text}`);
        shown.push(`${text}@${atMs}`);
      },
      finish: async (endMs) => {
        log.push(`encoder ${n} finished`);
        return { mimeType: 'video/test', bytes: new TextEncoder().encode(`${shown.join(' ')} end@${endMs}`) };
      },
      abort: async () => {
        log.push(`encoder ${n} aborted`);
      },
    };
  };
  return { open, log };
}

const b64 = (text: string): string => btoa(text);
const fromB64 = (base64: string): string => atob(base64);

function frame(name: string, receivedAtMs: number, scrollY: number, index: number): CompositorFrame {
  return { index, base64: b64(name), scrollX: 0, scrollY, viewportWidth: 1280, viewportHeight: 800, pageScaleFactor: 1, receivedAtMs };
}

const post: MilestoneCapture = {
  viewId: 2,
  entry: 'route',
  documentId: 1,
  loaderId: 'loader-a',
  url: 'https://app.example/inbox',
  label: '04-post-scroll-01',
  frame: frame('landed', 4_016, 600, 3),
  detail: 'Post-scroll #1',
};

function setUp(failOn?: string) {
  const [recorder, encoder] = channelPair();
  const encoders = fakeEncoders(failOn);
  const clips: Clip[] = [];
  serveClips(encoder, encoders.open);
  const sink = clipSinkOver(recorder, (clip) => clips.push(clip));
  const write = (...writes: ClipWrite[]) => writes.forEach((w) => sink.enqueue(w));
  return { sink, clips, log: encoders.log, write };
}

describe('clip sink over a channel', () => {
  it("translates the rule's writes into encoder calls, which carry only pictures and times", () => {
    const sent: ToEncoder[] = [];
    const sink = clipSinkOver({ post: (m) => sent.push(m), listen: () => () => {} }, () => {});
    sink.enqueue({ type: 'frame', id: 'scroll-episode-1', frame: frame('rest', 0, 0, 1), position: null });
    sink.enqueue({ type: 'frame', id: 'scroll-episode-1', frame: frame('landed', 300, 600, 2), position: null });
    sink.enqueue({ type: 'keep', id: 'scroll-episode-1', capture: post });
    sink.enqueue({ type: 'frame', id: 'scroll-episode-2', frame: frame('jitter', 900, 3, 3), position: null });
    sink.enqueue({ type: 'drop', id: 'scroll-episode-2' });

    expect(sent).toEqual([
      { type: 'add', clip: 'scroll-episode-1', png: b64('rest'), atMs: 0 },
      { type: 'add', clip: 'scroll-episode-1', png: b64('landed'), atMs: 250 },
      { type: 'finish', clip: 'scroll-episode-1', endMs: 500 },
      { type: 'add', clip: 'scroll-episode-2', png: b64('jitter'), atMs: 0 },
      { type: 'abort', clip: 'scroll-episode-2' },
    ]);
  });

  it('stamps each frame with its video time, and files the clip with its trace under the capture it belongs to', async () => {
    const { sink, clips, write } = setUp();
    write(
      // Positions are the page's, not the frames' (whose offsets are stale here).
      { type: 'frame', id: 'a', frame: frame('rest', 0, 54, 1), position: { x: 0, y: 0 } },
      { type: 'frame', id: 'a', frame: frame('moved', 4_000, 54, 2), position: { x: 0, y: 300 } },
      { type: 'frame', id: 'a', frame: frame('landed', 4_016, 54, 3), position: { x: 0, y: 600 } },
      { type: 'keep', id: 'a', capture: post },
    );
    await sink.drain();

    expect(clips).toHaveLength(1);
    const [clip] = clips;
    expect(clip).toMatchObject({
      viewId: 2,
      entry: 'route',
      documentId: 1,
      loaderId: 'loader-a',
      url: 'https://app.example/inbox',
      label: '04-post-scroll-01',
      mimeType: 'video/test',
    });
    // The encoder got exactly the times the trace has, and when to end.
    expect(fromB64(clip?.base64 ?? '')).toBe('rest@0 moved@250 landed@266 end@516');
    expect(clip?.trace).toEqual([
      { frameIndex: 1, atMs: 0, x: 0, y: 0 },
      { frameIndex: 2, atMs: 250, x: 0, y: 300 },
      { frameIndex: 3, atMs: 266, x: 0, y: 600 },
    ]);
  });

  it('aborts the encoder of a dropped clip, and files nothing', async () => {
    const { sink, clips, log, write } = setUp();
    write(
      { type: 'frame', id: 'a', frame: frame('rest', 0, 0, 1), position: null },
      { type: 'frame', id: 'a', frame: frame('moving', 300, 600, 2), position: null },
      { type: 'drop', id: 'a' },
    );
    await sink.drain();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(clips).toEqual([]);
    expect(log).toEqual(['encoder 1 aborted']);
  });

  it('gives every clip its own encoder, one finishing while the next is filmed', async () => {
    const { sink, clips, log, write } = setUp();
    write(
      { type: 'frame', id: 'a', frame: frame('a1', 0, 0, 1), position: null },
      { type: 'frame', id: 'a', frame: frame('a2', 300, 300, 2), position: null },
      { type: 'keep', id: 'a', capture: post },
      { type: 'frame', id: 'b', frame: frame('a2', 300, 300, 2), position: null },
      { type: 'frame', id: 'b', frame: frame('b2', 900, 700, 3), position: null },
      { type: 'keep', id: 'b', capture: { ...post, label: '04-post-scroll-02' } },
    );
    await sink.drain();

    expect(clips.map((c) => `${c.label}: ${fromB64(c.base64)}`)).toEqual([
      '04-post-scroll-01: a1@0 a2@250 end@500',
      '04-post-scroll-02: a2@0 b2@250 end@500',
    ]);
    expect(log).toEqual(['encoder 1 finished', 'encoder 2 finished']);
  });

  it('rejects drain when a clip fails to encode, naming it, after freeing its encoder', async () => {
    const { sink, clips, log, write } = setUp('broken');
    write(
      { type: 'frame', id: 'a', frame: frame('rest', 0, 0, 1), position: null },
      { type: 'frame', id: 'a', frame: frame('broken', 300, 600, 2), position: null },
      { type: 'keep', id: 'a', capture: post },
    );

    await expect(sink.drain()).rejects.toThrow(/04-post-scroll-01: Error: cannot decode broken/);
    expect(clips).toEqual([]);
    expect(log).toEqual(['encoder 1 aborted']);
  });

  it('leaves the position out of a trace sample when the page had not said one', async () => {
    const { sink, clips, write } = setUp();
    write(
      { type: 'frame', id: 'a', frame: frame('rest', 0, 0, 1), position: null },
      { type: 'frame', id: 'a', frame: frame('landed', 300, 0, 2), position: { x: 0, y: 600 } },
      { type: 'keep', id: 'a', capture: post },
    );
    await sink.drain();

    expect(clips[0]?.trace).toEqual([
      { frameIndex: 1, atMs: 0 },
      { frameIndex: 2, atMs: 250, x: 0, y: 600 },
    ]);
  });

  it('ignores a keep for a clip it never saw a frame of', async () => {
    const { sink, clips, write } = setUp();
    write({ type: 'keep', id: 'nothing', capture: post });

    await sink.drain();
    expect(clips).toEqual([]);
  });
});
