import { decodeBase64, encodeBase64 } from '@openuji/core';
import type { Channel, FromEncoder, ToEncoder } from './protocol.js';
import type { ClipEncoder, OpenEncoder } from './webm.js';

/** An open clip: its encoder, and the work already queued for it. */
type Encoding = Readonly<{ encoder: ClipEncoder; work: Promise<void> }>;

/**
 * The encoder side of a clip sink, where encoding may take its time: a worker
 * thread, a dedicated worker. Carries out `ClipEncoder`'s calls, one encoder
 * per clip, opened by its first picture; each clip's calls run in order, while
 * a clip may still be writing its file as the next one starts.
 */
export function serveClips(
  channel: Channel<ToEncoder, FromEncoder>,
  open: OpenEncoder,
): () => void {
  const clips = new Map<string, Encoding>();

  /** Queues `task` after the work already queued for `clip`. */
  const then = (clip: string, task: (encoder: ClipEncoder) => Promise<void>): Encoding => {
    const current = clips.get(clip) ?? { encoder: open(), work: Promise.resolve() };
    const next = { encoder: current.encoder, work: current.work.then(() => task(current.encoder)) };
    next.work.catch(() => {}); // reported by `finish`
    clips.set(clip, next);
    return next;
  };

  return channel.listen((message) => {
    const { clip } = message;
    switch (message.type) {
      case 'add': {
        then(clip, (encoder) => encoder.add(decodeBase64(message.png), message.atMs));
        return;
      }
      case 'finish': {
        const { encoder, work } = then(clip, async () => {});
        clips.delete(clip);
        work
          .then(() => encoder.finish(message.endMs))
          .then(
            ({ mimeType, bytes }) =>
              channel.post({ type: 'finished', clip, mimeType, file: encodeBase64(bytes) }),
            async (error: unknown) => {
              await encoder.abort().catch(() => {});
              channel.post({ type: 'failed', clip, message: String(error) });
            },
          );
        return;
      }
      case 'abort': {
        const { encoder, work } = then(clip, async () => {});
        clips.delete(clip);
        const abort = () => encoder.abort().catch(() => {});
        work.then(abort, abort);
        return;
      }
    }
  });
}
