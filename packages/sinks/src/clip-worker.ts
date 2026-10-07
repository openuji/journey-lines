/**
 * The encoder side of the Node host's clip sink, in its own worker thread, so
 * encoding never delays the recording's events. Started by `startClipWorker`.
 */
import { parentPort } from 'node:worker_threads';
import { loadLibav, serveClips, webmEncoder, type Channel, type FromEncoder, type ToEncoder } from '@openuji/clip-webm';

if (!parentPort) throw new Error('clip-worker runs as a worker thread');
const port = parentPort;

const channel: Channel<ToEncoder, FromEncoder> = {
  post: (message) => port.postMessage(message),
  listen: (on) => {
    port.on('message', on);
    return () => port.off('message', on);
  },
};

serveClips(channel, webmEncoder(await loadLibav()));
port.postMessage('ready');
