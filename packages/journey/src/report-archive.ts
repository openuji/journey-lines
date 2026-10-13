import {
  artifactFileName,
  captureLogRecord,
  clipLogRecord,
  decodeBase64,
  encodeBase64,
  type Clip,
  type CompositorFrame,
  type MilestoneCapture,
} from '@openuji/core';
import type { RecordingItem, RecordingMeta, StoredRecording } from './recording.js';
import type { ReportDraft } from './report-draft.js';
import type { ReportTemplate } from './report-template.js';

export type ArchiveEntry = Readonly<{ name: string; bytes: Uint8Array<ArrayBuffer> }>;

/** The archive file that holds a capture's picture. */
export function captureFile(capture: MilestoneCapture): string {
  return artifactFileName(capture, 'png');
}

/** The archive file that holds a clip's video. */
export function clipFile(clip: Clip): string {
  return artifactFileName(clip, 'webm');
}

/** The archive file that holds a recording item's media. */
export function itemFile(item: RecordingItem): string {
  return item.kind === 'capture' ? captureFile(item.capture) : clipFile(item.clip);
}

/** Exactly the CLI's artifacts, with paths relative to the archive root. */
export function recordingArtifacts(items: readonly RecordingItem[]): ArchiveEntry[] {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  const media: ArchiveEntry[] = [];

  items.forEach((item, index) => {
    const sequence = index + 1;
    const name = itemFile(item);
    if (item.kind === 'capture') {
      lines.push(JSON.stringify(captureLogRecord(item.capture, sequence, name, item.epochMs)));
      media.push({ name, bytes: decodeBase64(item.capture.frame.base64) });
    } else {
      lines.push(JSON.stringify(clipLogRecord(item.clip, sequence, name, item.epochMs)));
      media.push({ name, bytes: decodeBase64(item.clip.base64) });
    }
  });

  return [
    { name: 'interactions.ndjson', bytes: encoder.encode(lines.length ? `${lines.join('\n')}\n` : '') },
    ...media,
  ];
}

/** Everything a report tab renders: another renderer given this shows the same report. */
export type ReportExport = Readonly<{
  version: typeof REPORT_VERSION;
  template: ReportTemplate;
  draft: ReportDraft;
  recording: StoredRecording;
}>;

export const REPORT_VERSION = 2;
export const REPORT_FILE = 'report.json';

/** A recording item in `report.json`: its picture or video is the named file beside it. */
type FiledItem =
  | Readonly<{ kind: 'capture'; epochMs: number; file: string; capture: Omit<MilestoneCapture, 'frame'> & { frame: Omit<CompositorFrame, 'base64'> } }>
  | Readonly<{ kind: 'clip'; epochMs: number; file: string; clip: Omit<Clip, 'base64'> }>;

type FiledReport = Omit<ReportExport, 'recording'> & {
  recording: Readonly<{ meta: RecordingMeta; items: readonly FiledItem[] }>;
};

function filed(item: RecordingItem): FiledItem {
  if (item.kind === 'capture') {
    const { base64: _, ...frame } = item.capture.frame;
    return { kind: 'capture', epochMs: item.epochMs, file: itemFile(item), capture: { ...item.capture, frame } };
  }
  const { base64: _, ...clip } = item.clip;
  return { kind: 'clip', epochMs: item.epochMs, file: itemFile(item), clip };
}

/** The CLI's artifacts, plus `report.json`, which names the same media files. */
export function reportArtifacts(report: ReportExport): ArchiveEntry[] {
  const json: FiledReport = { ...report, recording: { meta: report.recording.meta, items: report.recording.items.map(filed) } };
  return [
    ...recordingArtifacts(report.recording.items),
    { name: REPORT_FILE, bytes: new TextEncoder().encode(`${JSON.stringify(json, null, 2)}\n`) },
  ];
}

/** The inverse of `reportArtifacts`, from an archive's unzipped entries. */
export function readReportArtifacts(entries: readonly ArchiveEntry[]): ReportExport {
  const files = new Map(entries.map((entry) => [entry.name, entry.bytes]));
  const media = (name: string): string => {
    const bytes = files.get(name);
    if (!bytes) throw new Error(`The report names ${name}, which the archive does not contain.`);
    return encodeBase64(bytes);
  };
  const json = files.get(REPORT_FILE);
  if (!json) throw new Error(`The archive has no ${REPORT_FILE}.`);
  const report = JSON.parse(new TextDecoder().decode(json)) as FiledReport;
  if (report.version !== REPORT_VERSION) throw new Error(`Unsupported report version ${String(report.version)}.`);
  const items = report.recording.items.map(({ file, ...item }): RecordingItem => item.kind === 'capture'
    ? { ...item, capture: { ...item.capture, frame: { ...item.capture.frame, base64: media(file) } } }
    : { ...item, clip: { ...item.clip, base64: media(file) } });
  return { ...report, recording: { meta: report.recording.meta, items } };
}

/** ZIP stored entries: PNG and WebM are already compressed, so no codec is needed. */
export function zipStored(entries: readonly ArchiveEntry[]): Uint8Array<ArrayBuffer> {
  if (entries.length > 0xffff) throw new Error('Too many recording artifacts for one ZIP.');
  const encoder = new TextEncoder();
  const files = entries.map((entry) => ({ ...entry, nameBytes: encoder.encode(entry.name), crc: crc32(entry.bytes) }));
  const localBytes = files.reduce((sum, file) => sum + 30 + file.nameBytes.length + file.bytes.length, 0);
  const centralBytes = files.reduce((sum, file) => sum + 46 + file.nameBytes.length, 0);
  const total = localBytes + centralBytes + 22;
  if (total > 0xffffffff) throw new Error('Recording is too large for a ZIP archive.');
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  let offset = 0;
  const offsets: number[] = [];

  for (const file of files) {
    if (file.nameBytes.length > 0xffff) throw new Error('Recording filename is too long.');
    offsets.push(offset);
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 8, 0, true); // stored
    view.setUint16(offset + 10, 0, true); // 1980-01-01 00:00:00
    view.setUint16(offset + 12, 33, true);
    view.setUint32(offset + 14, file.crc, true);
    view.setUint32(offset + 18, file.bytes.length, true);
    view.setUint32(offset + 22, file.bytes.length, true);
    view.setUint16(offset + 26, file.nameBytes.length, true);
    output.set(file.nameBytes, offset + 30);
    output.set(file.bytes, offset + 30 + file.nameBytes.length);
    offset += 30 + file.nameBytes.length + file.bytes.length;
  }

  const centralStart = offset;
  files.forEach((file, index) => {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, 0, true);
    view.setUint16(offset + 14, 33, true);
    view.setUint32(offset + 16, file.crc, true);
    view.setUint32(offset + 20, file.bytes.length, true);
    view.setUint32(offset + 24, file.bytes.length, true);
    view.setUint16(offset + 28, file.nameBytes.length, true);
    view.setUint32(offset + 42, offsets[index]!, true);
    output.set(file.nameBytes, offset + 46);
    offset += 46 + file.nameBytes.length;
  });

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 8, files.length, true);
  view.setUint16(offset + 10, files.length, true);
  view.setUint32(offset + 12, centralBytes, true);
  view.setUint32(offset + 16, centralStart, true);
  return output;
}

/**
 * The inverse of `zipStored`: the entries of an archive whose files are
 * stored. A compressed file means the archive was re-zipped after download.
 */
export function unzipStored(archive: Uint8Array): ArchiveEntry[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const end = endOfCentralDirectory(view);
  const decoder = new TextDecoder();
  const entries: ArchiveEntry[] = [];
  let offset = view.getUint32(end + 16, true);

  for (let index = view.getUint16(end + 10, true); index > 0; index--) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Not a ZIP archive: its directory is broken.');
    const nameLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(archive.subarray(offset + 46, offset + 46 + nameLength));
    if (view.getUint16(offset + 10, true) !== 0) {
      throw new Error(`${name} is compressed. Use the archive as it was downloaded, not re-zipped.`);
    }
    const local = view.getUint32(offset + 42, true);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const bytes = archive.slice(start, start + view.getUint32(offset + 20, true));
    if (crc32(bytes) !== view.getUint32(offset + 16, true)) throw new Error(`${name} is damaged.`);
    entries.push({ name, bytes });
    offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return entries;
}

/** The record that ends every ZIP, found from the back past an optional comment. */
function endOfCentralDirectory(view: DataView): number {
  const last = view.byteLength - 22;
  for (let at = last; at >= Math.max(0, last - 0xffff); at--) {
    if (view.getUint32(at, true) === 0x06054b50) return at;
  }
  throw new Error('Not a ZIP archive.');
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
