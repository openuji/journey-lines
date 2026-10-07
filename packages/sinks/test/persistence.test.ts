import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Clip, MilestoneCapture } from '@openuji/core';
import { PersistenceSink } from '@openuji/sinks';

const filing = {
  viewId: 1,
  entry: 'load',
  documentId: 1,
  loaderId: 'loader-a',
  url: 'https://example.com/',
} as const;

const post: MilestoneCapture = {
  ...filing,
  label: '04-post-scroll-01',
  frame: {
    index: 9,
    base64: btoa('png bytes'),
    scrollX: 0,
    scrollY: 600,
    viewportWidth: 1280,
    viewportHeight: 800,
    pageScaleFactor: 1,
    receivedAtMs: 300,
  },
  detail: 'Post-scroll #1',
  scrollEpisode: { path: [], cause: { kind: 'wheel' } },
};

const clip: Clip = {
  ...filing,
  label: '04-post-scroll-01',
  mimeType: 'video/webm',
  base64: btoa('webm bytes'),
  trace: [
    { frameIndex: 8, atMs: 0, x: 0, y: 0 },
    { frameIndex: 9, atMs: 250, x: 0, y: 600 },
  ],
};

let dir = '';
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('PersistenceSink', () => {
  it('writes a clip next to the capture it belongs to, its trace in the same log and sequence', async () => {
    dir = await mkdtemp(join(tmpdir(), 'uxr-sink-'));
    const sink = new PersistenceSink({ outDir: dir, logFile: join(dir, 'interactions.ndjson') });

    sink.enqueue(post);
    sink.enqueueClip(clip);
    await sink.drain();

    expect(await readFile(join(dir, 'nav-00001-04-post-scroll-01.png'), 'utf8')).toBe('png bytes');
    expect(await readFile(join(dir, 'nav-00001-04-post-scroll-01.webm'), 'utf8')).toBe('webm bytes');

    const lines = (await readFile(join(dir, 'interactions.ndjson'), 'utf8')).trim().split('\n');
    const [capture, video] = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(capture).toMatchObject({ sequence: 1, label: '04-post-scroll-01', screenshotFile: 'nav-00001-04-post-scroll-01.png' });
    expect(video).toMatchObject({
      sequence: 2,
      viewId: 1,
      entry: 'load',
      url: 'https://example.com/',
      label: '04-post-scroll-01',
      videoFile: 'nav-00001-04-post-scroll-01.webm',
      videoPath: join(dir, 'nav-00001-04-post-scroll-01.webm'),
      mimeType: 'video/webm',
      byteLength: 10,
      trace: clip.trace,
    });
    expect(video).not.toHaveProperty('screenshotFile');
  });
});
