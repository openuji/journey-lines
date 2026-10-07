import { Worker } from 'node:worker_threads';
import type { Clip } from '@openuji/core';
import {
  clipSinkOver,
  type Channel,
  type ClipWorker,
  type FromEncoder,
  type ToEncoder,
} from '@openuji/clip-webm';

export type { ClipWorker };

/**
 * The built worker. From `src` as from `dist` it is `dist/clip-worker.js`:
 * Node runs the compiled file, so run `pnpm build` before starting one.
 */
const WORKER = new URL('../dist/clip-worker.js', import.meta.url);

/**
 * The Node host's clip sink: encoding in a worker thread, each finished clip
 * handed to `onClip` (`PersistenceSink.enqueueClip`, say). Resolves once the
 * encoder is loaded.
 */
export async function startClipWorker(onClip: (clip: Clip) => void): Promise<ClipWorker> {
  const worker = new Worker(WORKER);
  await new Promise<void>((resolve, reject) => {
    worker.once('message', () => resolve());
    worker.once('error', reject);
  });

  const channel: Channel<FromEncoder, ToEncoder> = {
    post: (message) => worker.postMessage(message),
    listen: (on) => {
      worker.on('message', on);
      return () => worker.off('message', on);
    },
  };

  return {
    sink: clipSinkOver(channel, onClip),
    close: async () => {
      await worker.terminate();
    },
  };
}
