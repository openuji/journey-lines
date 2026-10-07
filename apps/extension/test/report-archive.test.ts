import { describe, expect, it } from 'vitest';
import { artifactFileName, encodeBase64, type Clip, type MilestoneCapture } from '@openuji/core';
import { recordingArtifacts, zipStored } from '../src/lib/report-archive';

const png = new Uint8Array([137, 80, 78, 71]);
const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
const capture = {
  viewId: 1,
  entry: 'load',
  documentId: 1,
  loaderId: 'a',
  url: 'https://example.com/',
  label: '00-first',
  detail: 'First frame',
  frame: { receivedAtMs: 1_010, base64: encodeBase64(png) },
} as MilestoneCapture;
const clip = {
  viewId: 1,
  entry: 'load',
  documentId: 1,
  loaderId: 'a',
  url: 'https://example.com/',
  label: '04-post-scroll-01',
  mimeType: 'video/webm',
  base64: encodeBase64(webm),
  trace: [],
} as Clip;

describe('recording report archive', () => {
  it('exports an empty recording as an empty interactions log', () => {
    const entries = recordingArtifacts([]);
    expect(entries.map((entry) => entry.name)).toEqual(['interactions.ndjson']);
    expect(entries[0]?.bytes.length).toBe(0);
  });

  it('keeps artifact names inside the archive root', () => {
    expect(artifactFileName({ ...capture, label: '../unexpected path' }, 'png'))
      .toBe('nav-00001-..-unexpected-path.png');
  });

  it('emits only the existing NDJSON, screenshot, and clip artifacts', () => {
    const entries = recordingArtifacts([
      { kind: 'capture', epochMs: 1_010, capture },
      { kind: 'clip', epochMs: 1_020, clip },
    ]);
    expect(entries.map((entry) => entry.name)).toEqual([
      'interactions.ndjson',
      'nav-00001-00-first.png',
      'nav-00001-04-post-scroll-01.webm',
    ]);
    expect(entries[1]?.bytes).toEqual(png);
    expect(entries[2]?.bytes).toEqual(webm);
    const records = new TextDecoder().decode(entries[0]?.bytes).trim().split('\n').map((line) => JSON.parse(line));
    expect(records).toMatchObject([
      { sequence: 1, screenshotPath: 'nav-00001-00-first.png', byteLength: 4 },
      { sequence: 2, videoPath: 'nav-00001-04-post-scroll-01.webm', byteLength: 4 },
    ]);
  });

  it('writes a ZIP with one central entry per artifact', () => {
    const bytes = zipStored(recordingArtifacts([{ kind: 'capture', epochMs: 1_010, capture }]));
    const view = new DataView(bytes.buffer);
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const central = view.getUint32(end + 16, true);
    expect(view.getUint32(central, true)).toBe(0x02014b50);
  });
});
