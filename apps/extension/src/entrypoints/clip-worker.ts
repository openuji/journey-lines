import {
  loadLibav,
  serveClips,
  webmEncoder,
  type FromEncoder,
  type ToEncoder,
} from '@openuji/clip-webm';
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { clipChannel } from '../lib/clips';

/**
 * The encoder side of the clip sink, run as a dedicated worker by the
 * offscreen document. Its own file (`/clip-worker.js`), built into the
 * extension in dev and production alike: a worker must come from the page's
 * own origin, and in dev WXT serves pages' scripts from its dev server.
 * Where the build puts the vendored libav.js files: `wxt.config.ts`.
 */
const LIBAV_BASE = new URL('/libav', self.location.origin).href;

async function start(): Promise<void> {
  serveClips(clipChannel<ToEncoder, FromEncoder>(), webmEncoder(await loadLibav(LIBAV_BASE)));
}

export default defineUnlistedScript(() => {
  // A failure here would otherwise be a rejected promise nobody hears.
  start().then(
    () => postMessage({ ready: true }),
    (error: unknown) => postMessage({ ready: false, error: String(error) }),
  );
});
