import {
  loadLibav,
  serveClips,
  webmEncoder,
  type FromEncoder,
  type ToEncoder,
} from '@openuji/clip-webm';
import { clipChannel } from '../../lib/clips';

/**
 * The encoder side of the clip sink, in a dedicated worker. Where the build
 * puts the vendored libav.js files: `wxt.config.ts`.
 */
const LIBAV_BASE = new URL('/libav', self.location.origin).href;

async function start(): Promise<void> {
  serveClips(clipChannel<ToEncoder, FromEncoder>(), webmEncoder(await loadLibav(LIBAV_BASE)));
}

// A failure here would otherwise be a rejected promise nobody hears.
start().then(
  () => postMessage({ ready: true }),
  (error: unknown) => postMessage({ ready: false, error: String(error) }),
);
