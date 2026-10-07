import { describe, expect, it } from 'vitest';
import type { Clip, MilestoneCapture } from '@openuji/core';
import { MemoryRecordingStore } from '../src/lib/recording-store';

const TAB = { id: 7, title: 'Example', url: 'https://example.com/' };
const capture = { viewId: 1, label: '00-first', frame: { receivedAtMs: 1_010 } } as MilestoneCapture;
const clip = { viewId: 1, label: '04-post-scroll-01', mimeType: 'video/webm' } as Clip;

describe('MemoryRecordingStore', () => {
  it('keeps a completed recording in output order until discarded', async () => {
    const store = new MemoryRecordingStore();
    const id = await store.begin(TAB, 1_000);
    expect(await store.get(id)).toBeNull();

    store.appendCapture(id, capture);
    store.appendClip(id, clip, 1_020);
    await store.finish(id, 1_030, 'user', 2);
    const session = await store.get(id);
    expect(session?.meta).toEqual({ id, tab: TAB, startedAtMs: 1_000, endedAtMs: 1_030, endedBy: 'user', droppedFrames: 2 });
    expect(session?.items).toEqual([
      { kind: 'capture', epochMs: 1_010, capture },
      { kind: 'clip', epochMs: 1_020, clip },
    ]);

    const nextId = await store.begin(TAB, 2_000);
    expect(await store.get(id)).toEqual(session);
    await store.discard(nextId);
    expect(await store.get(nextId)).toBeNull();
  });
});
