import { base64ByteLength } from './base64.js';
import type { Clip, ClipFiling } from './clip.js';
import type { InteractionLogRecord, ClipLogRecord, MilestoneCapture } from './domain.js';

/** The filename shared by the CLI sink and extension report export. */
export function artifactFileName(filing: ClipFiling, extension: 'png' | 'webm'): string {
  const safeLabel = filing.label.replace(/[^A-Za-z0-9._-]/g, '-');
  return `nav-${String(filing.viewId).padStart(5, '0')}-${safeLabel}.${extension}`;
}

function recordHeader(filing: ClipFiling, sequence: number, epochMs: number) {
  return {
    sequence,
    timestamp: new Date(epochMs).toISOString(),
    epochMs,
    viewId: filing.viewId,
    entry: filing.entry,
    documentId: filing.documentId,
    loaderId: filing.loaderId,
    url: filing.url,
    label: filing.label,
  };
}

export function captureLogRecord(
  capture: MilestoneCapture,
  sequence: number,
  screenshotPath: string,
  epochMs: number,
): InteractionLogRecord {
  return {
    ...recordHeader(capture, sequence, epochMs),
    screenshotFile: artifactFileName(capture, 'png'),
    screenshotPath,
    byteLength: base64ByteLength(capture.frame.base64),
    ...(capture.position ? { scroll: capture.position } : {}),
    detail: capture.detail,
    ...(capture.domTarget ? { domTarget: capture.domTarget } : {}),
    ...(capture.scrollEpisode ? { scrollEpisode: capture.scrollEpisode } : {}),
  };
}

export function clipLogRecord(
  clip: Clip,
  sequence: number,
  videoPath: string,
  epochMs: number,
): ClipLogRecord {
  return {
    ...recordHeader(clip, sequence, epochMs),
    videoFile: artifactFileName(clip, 'webm'),
    videoPath,
    mimeType: clip.mimeType,
    byteLength: base64ByteLength(clip.base64),
    trace: clip.trace,
  };
}
