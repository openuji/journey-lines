import LibAVWrapper, { type LibAV } from '../vendor/libav/libav-uxr-clip.mjs';

export type { LibAV };

/**
 * Loads the vendored libav.js build in this thread (no worker of its own).
 * `base` is where its `.wasm.mjs` and `.wasm` files are served from; leave it
 * out where they sit next to the wrapper, as in Node.
 *
 * FFmpeg logs warnings and errors only: at its default it announces every
 * encoder it opens, once per clip.
 */
export async function loadLibav(base?: string): Promise<LibAV> {
  const libav = await LibAVWrapper.LibAV({ noworker: true, nothreads: true, ...(base ? { base } : {}) });
  await libav.av_log_set_level(libav.AV_LOG_WARNING);
  return libav;
}
