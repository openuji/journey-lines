import { describe, expect, it } from 'vitest';
import { artifactFileName, encodeBase64, type Clip, type MilestoneCapture } from '@openuji/core';
import {
  readReportArtifacts,
  recordingArtifacts,
  REPORT_VERSION,
  reportArtifacts,
  zipStored,
  type ReportExport,
} from '../src/lib/report-archive';
import { journeyTemplate } from '../src/lib/report-template';
import { campusDraft, campusRecording } from '../src/stories/campus-journey';
import { STORY_FRAME } from '../src/stories/fixtures';

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

describe('report export', () => {
  const report: ReportExport = { version: REPORT_VERSION, template: journeyTemplate, draft: campusDraft, recording: campusRecording };

  it('adds report.json beside the unchanged CLI artifacts, naming the same media files', () => {
    const entries = reportArtifacts(report);
    expect(entries.slice(0, -1)).toEqual(recordingArtifacts(campusRecording.items));
    const json = entries.at(-1)!;
    expect(json.name).toBe('report.json');
    const text = new TextDecoder().decode(json.bytes);
    // Media stay in their files; the JSON only names them.
    expect(text).not.toContain(STORY_FRAME);
    const parsed = JSON.parse(text);
    expect(parsed).toMatchObject({ version: 1, draft: campusDraft, template: journeyTemplate, recording: { meta: campusRecording.meta } });
    const names = new Set(entries.map((entry) => entry.name));
    expect(parsed.recording.items.every((item: { file: string }) => names.has(item.file))).toBe(true);
  });

  it('reads back exactly what was exported: the recording, the draft, and the template', () => {
    expect(readReportArtifacts(reportArtifacts(report))).toEqual(report);
  });

  it('names what is missing instead of rendering a partial report', () => {
    const entries = reportArtifacts(report);
    expect(() => readReportArtifacts(entries.filter((entry) => entry.name !== 'report.json'))).toThrow('no report.json');
    expect(() => readReportArtifacts(entries.filter((entry) => !entry.name.endsWith('.webm')))).toThrow('.webm');
  });
});
