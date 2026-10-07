# libav.js, built for scroll clips

A build of [libav.js](https://github.com/Yahweasel/libav.js) (FFmpeg compiled
to WebAssembly) with only what a scroll clip needs: FFmpeg's PNG decoder, the
scaler, libvpx's VP8 encoder and the WebM muxer. Everything from a screencast
PNG to a WebM file happens in WebAssembly, the same in Node and in a browser.

| File | What |
| --- | --- |
| `libav-uxr-clip.mjs` | The libav.js wrapper (ES module); finds the files below next to itself unless given a `base` |
| `libav-6.10.9.0-uxr-clip.wasm.mjs` | The Emscripten glue, with the license texts of everything compiled in |
| `libav-6.10.9.0-uxr-clip.wasm.wasm` | The WebAssembly |
| `libav-uxr-clip.d.mts` | Our types for the part of the API we use |

Built by `../../build-libav.sh` from libav.js tag `v6.10.9.0` with the fragments
`avformat avcodec muxer-webm libvpx encoder-libvpx_vp8 zlib decoder-png swscale`,
in the `emscripten/emsdk` image pinned there (emcc 6.0.11). Rerun the script to
rebuild; don't edit these files by hand.

## License

These files combine FFmpeg
(LGPL-2.1-or-later), libvpx (BSD-3-Clause), zlib (zlib License) and the
libav.js wrapper (0BSD); the full texts are in the header of
`libav-6.10.9.0-uxr-clip.wasm.mjs`. The corresponding source is libav.js
`v6.10.9.0` (https://github.com/Yahweasel/libav.js/tree/v6.10.9.0) and the
FFmpeg, libvpx and zlib versions it downloads, built as `build-libav.sh` does.
The WebAssembly ships as a separate, unmodified file, so it can be replaced by
a rebuild from that source.
