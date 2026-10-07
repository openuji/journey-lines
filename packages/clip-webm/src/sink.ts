import type {
  Clip,
  ClipFiling,
  ClipSink,
  ClipTraceSample,
  ClipWrite,
  MilestoneCapture,
} from '@openuji/core';
import type { Channel, FromEncoder, ToEncoder } from './protocol.js';
import { endOf, place, type Timeline } from './timeline.js';

/** A clip still receiving frames. */
type Filming = { timeline: Timeline; trace: ClipTraceSample[] };

/** A kept clip waiting for its file. */
type Waiting = Readonly<{ filing: ClipFiling; trace: readonly ClipTraceSample[]; settle: () => void }>;

/**
 * The recorder side of a clip sink, and the one place the domain meets the
 * encoder: a rule's clip writes become encoder calls over `channel` (`frame`
 * → `add`, `keep` → `finish`, `drop` → `abort`). It decides each frame's time
 * in the video (`timeline.ts`) and keeps the trace from the same times; when
 * the encoder returns the file, `onClip` gets the clip, filed like the capture
 * it belongs to.
 */
export function clipSinkOver(
  channel: Channel<FromEncoder, ToEncoder>,
  onClip: (clip: Clip) => void,
): ClipSink {
  const filming = new Map<string, Filming>();
  const waiting = new Map<string, Waiting>();
  const settled: Promise<void>[] = [];
  const failures: string[] = [];

  channel.listen((message) => {
    const clip = waiting.get(message.clip);
    if (!clip) return;
    waiting.delete(message.clip);
    if (message.type === 'finished') {
      onClip({ ...clip.filing, mimeType: message.mimeType, base64: message.file, trace: clip.trace });
    } else {
      failures.push(`${clip.filing.label}: ${message.message}`);
    }
    clip.settle();
  });

  const frame = ({ id, frame }: Extract<ClipWrite, { type: 'frame' }>): void => {
    const clip = filming.get(id);
    const [atMs, timeline] = place(clip?.timeline ?? null, frame.receivedAtMs);
    const sample = { frameIndex: frame.index, atMs, x: frame.scrollX, y: frame.scrollY };
    if (clip) {
      clip.timeline = timeline;
      clip.trace.push(sample);
    } else {
      filming.set(id, { timeline, trace: [sample] });
    }
    channel.post({ type: 'add', clip: id, png: frame.base64, atMs });
  };

  const keep = ({ id, capture }: Extract<ClipWrite, { type: 'keep' }>): void => {
    const clip = filming.get(id);
    if (!clip) return;
    filming.delete(id);
    settled.push(
      new Promise((settle) => waiting.set(id, { filing: filingOf(capture), trace: clip.trace, settle })),
    );
    channel.post({ type: 'finish', clip: id, endMs: endOf(clip.timeline) });
  };

  const drop = ({ id }: Extract<ClipWrite, { type: 'drop' }>): void => {
    filming.delete(id);
    channel.post({ type: 'abort', clip: id });
  };

  return {
    name: 'clips',
    enqueue: (write) => {
      switch (write.type) {
        case 'frame':
          return frame(write);
        case 'keep':
          return keep(write);
        case 'drop':
          return drop(write);
      }
    },
    async drain() {
      await Promise.all(settled);
      if (failures.length > 0) {
        throw new Error(`${failures.length} clip(s) failed to encode:\n  ${failures.join('\n  ')}`);
      }
    },
  };
}

function filingOf({ viewId, entry, documentId, loaderId, url, label }: MilestoneCapture): ClipFiling {
  return { viewId, entry, documentId, loaderId, url, label };
}
