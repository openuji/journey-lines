#!/usr/bin/env sh
# Rebuilds vendor/libav: libav.js with only what a scroll clip needs, so a
# screencast PNG becomes WebM entirely in WebAssembly. Needs git and Docker.
set -eu

LIBAVJS_TAG=v6.10.9.0
# emcc 6.0.11; pinned by digest so every rebuild compiles the same way.
EMSDK_IMAGE=emscripten/emsdk@sha256:cdefec943f04fd4b2b2fe23b0a1a346be9fc560ef5784a83faa27dd351381372
FRAGMENTS='["avformat","avcodec","muxer-webm","libvpx","encoder-libvpx_vp8","zlib","decoder-png","swscale"]'
VARIANT=uxr-clip
VERSION=6.10.9.0

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

git clone --quiet --depth 1 --branch "$LIBAVJS_TAG" https://github.com/Yahweasel/libav.js.git "$work/libav.js"

docker run --rm -v "$work/libav.js:/src" -w /src -e FRAGMENTS="$FRAGMENTS" "$EMSDK_IMAGE" bash -c "
  set -e
  apt-get update -y >/dev/null && apt-get install -y pkg-config >/dev/null
  (cd configs && ./mkconfig.js $VARIANT \"\$FRAGMENTS\")
  make -j\$(nproc) dist/libav-$VERSION-$VARIANT.wasm.mjs dist/libav-$VERSION-$VARIANT.mjs dist/libav-$VARIANT.mjs
"

for file in "libav-$VARIANT.mjs" "libav-$VERSION-$VARIANT.wasm.mjs" "libav-$VERSION-$VARIANT.wasm.wasm"; do
  cp "$work/libav.js/dist/$file" "$here/vendor/libav/$file"
done
echo "vendor/libav rebuilt from libav.js $LIBAVJS_TAG"
