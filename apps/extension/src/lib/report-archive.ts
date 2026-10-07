import {
  artifactFileName,
  captureLogRecord,
  clipLogRecord,
  decodeBase64,
} from '@openuji/core';
import type { RecordingItem } from './recording-store';

export type ArchiveEntry = Readonly<{ name: string; bytes: Uint8Array<ArrayBuffer> }>;

/** Exactly the CLI's artifacts, with paths relative to the archive root. */
export function recordingArtifacts(items: readonly RecordingItem[]): ArchiveEntry[] {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  const media: ArchiveEntry[] = [];

  items.forEach((item, index) => {
    const sequence = index + 1;
    if (item.kind === 'capture') {
      const name = artifactFileName(item.capture, 'png');
      lines.push(JSON.stringify(captureLogRecord(item.capture, sequence, name, item.epochMs)));
      media.push({ name, bytes: decodeBase64(item.capture.frame.base64) });
    } else {
      const name = artifactFileName(item.clip, 'webm');
      lines.push(JSON.stringify(clipLogRecord(item.clip, sequence, name, item.epochMs)));
      media.push({ name, bytes: decodeBase64(item.clip.base64) });
    }
  });

  return [
    { name: 'interactions.ndjson', bytes: encoder.encode(lines.length ? `${lines.join('\n')}\n` : '') },
    ...media,
  ];
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

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
