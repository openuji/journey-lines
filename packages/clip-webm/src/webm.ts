import type { LibAV, LibAVFrame } from '../vendor/libav/libav-uxr-clip.mjs';

/** One clip being encoded: PNG pictures in, a video file out. */
export interface ClipEncoder {
  /** The next picture, a PNG, shown from `atMs` into the video. */
  add(png: Uint8Array, atMs: number): Promise<void>;
  /** Shows the last picture until `endMs`, then returns the file. */
  finish(endMs: number): Promise<Readonly<{ mimeType: string; bytes: Uint8Array }>>;
  /** Frees what the clip holds; no file. */
  abort(): Promise<void>;
}

/** Opens the encoder for one clip. Nothing is allocated before its first picture. */
export type OpenEncoder = () => ClipEncoder;

export interface WebmOptions {
  /** Size of the video relative to the frames. */
  readonly scale?: number;
  /** VP8 constant quality, 4 (best) to 63. */
  readonly crf?: number;
  /** Cap on the bit rate crf may use, bits/s. */
  readonly maxBitRate?: number;
}

/**
 * Half size at crf 10: on a real page's scroll (Chrome 154, 2026-10-07) it
 * encodes a 60 fps scroll in 0.6× its length, in Node and in an extension
 * worker alike, at about 1.2 MB per second of scrolling. Full size took 1.4×.
 */
export const WEBM_DEFAULTS = { scale: 0.5, crf: 10, maxBitRate: 10_000_000 } as const;

const MIME_TYPE = 'video/webm';
const SWS_BILINEAR = 2;

/** A clip's video while it is being written, in libav's heap. */
type Video = {
  readonly ctx: number;
  readonly frame: number;
  readonly pkt: number;
  readonly oc: number;
  readonly pb: number;
  readonly width: number;
  readonly height: number;
  /** The scaled picture, reused for every frame. */
  readonly scaled: number;
  /** Scales pictures of `source` to the video's size and format. */
  sws: number;
  source: Source;
};

type Source = Readonly<{ width: number; height: number; format: number }>;

/**
 * Encodes clips with the vendored libav.js build: FFmpeg decodes each PNG,
 * scales it, libvpx encodes VP8, and the WebM muxer writes the file, all in
 * WebAssembly. `libav` is a loaded instance (see `loadLibav`); every clip gets
 * its own encoder and its own file in libav's memory.
 */
export function webmEncoder(libav: LibAV, options: WebmOptions = {}): OpenEncoder {
  const settings = { ...WEBM_DEFAULTS, ...options };
  let opened = 0;

  return () => {
    const file = `clip-${++opened}.webm`;
    let video: Video | null = null;
    let last: LibAVFrame | null = null;

    const encode = async (v: Video, picture: LibAVFrame, pts: number): Promise<void> => {
      const packets = await libav.ff_encode_multi(v.ctx, v.frame, v.pkt, [{ ...picture, pts, ptshi: 0 }]);
      await libav.ff_write_multi(v.oc, v.pkt, packets);
    };

    return {
      async add(png, atMs) {
        const picture = await decodePng(libav, png);
        try {
          video ??= await openVideo(libav, file, await sourceOf(libav, picture), settings);
          last = await scale(libav, video, picture);
        } finally {
          await libav.av_frame_free_js(picture);
        }
        await encode(video, last, atMs);
      },

      async finish(endMs) {
        if (!video || !last) throw new Error('A clip needs at least one picture');
        await encode(video, last, endMs);
        const rest = await libav.ff_encode_multi(video.ctx, video.frame, video.pkt, [], true);
        await libav.ff_write_multi(video.oc, video.pkt, rest);
        await libav.av_write_trailer(video.oc);
        await closeVideo(libav, video);
        video = null;
        const bytes = await libav.readFile(file);
        await libav.unlink(file);
        return { mimeType: MIME_TYPE, bytes };
      },

      async abort() {
        if (!video) return;
        await closeVideo(libav, video);
        video = null;
        await libav.unlink(file).catch(() => {});
      },
    };
  };
}

/**
 * A picture from PNG bytes, as a frame in libav's heap; the caller frees it.
 * A decoder per picture: FFmpeg's png decoder keeps state between packets,
 * and decodes every picture after the first wrongly.
 */
async function decodePng(libav: LibAV, png: Uint8Array): Promise<number> {
  const [, ctx, pkt, frame] = await libav.ff_init_decoder('png');
  try {
    const [picture] = await libav.ff_decode_multi(ctx, pkt, frame, [{ data: png, pts: 0 }], {
      copyoutFrame: 'ptr',
    });
    if (picture === undefined) throw new Error('Not a PNG picture');
    return picture;
  } finally {
    await libav.ff_free_decoder(ctx, pkt, frame);
  }
}

async function sourceOf(libav: LibAV, picture: number): Promise<Source> {
  return {
    width: await libav.AVFrame_width(picture),
    height: await libav.AVFrame_height(picture),
    format: await libav.AVFrame_format(picture),
  };
}

const even = (n: number): number => Math.max(2, n - (n % 2));

async function openVideo(
  libav: LibAV,
  file: string,
  source: Source,
  { scale, crf, maxBitRate }: Required<WebmOptions>,
): Promise<Video> {
  const width = even(Math.round(source.width * scale));
  const height = even(Math.round(source.height * scale));
  const [, ctx, frame, pkt] = await libav.ff_init_encoder('libvpx', {
    ctx: { width, height, pix_fmt: libav.AV_PIX_FMT_YUV420P, bit_rate: maxBitRate },
    time_base: [1, 1000],
    options: { deadline: 'realtime', 'cpu-used': '8', 'lag-in-frames': '0', crf: String(crf) },
  });
  const [oc, , pb] = await libav.ff_init_muxer(
    { format_name: 'webm', filename: file, open: true },
    [[ctx, 1, 1000]],
  );
  await libav.avformat_write_header(oc, 0);
  const sws = await scalerFor(libav, source, width, height);
  const scaled = await libav.av_frame_alloc();
  return { ctx, frame, pkt, oc, pb, width, height, scaled, sws, source };
}

function scalerFor(libav: LibAV, source: Source, width: number, height: number): Promise<number> {
  return libav.sws_getContext(
    source.width,
    source.height,
    source.format,
    width,
    height,
    libav.AV_PIX_FMT_YUV420P,
    SWS_BILINEAR,
    0,
    0,
    0,
  );
}

/** `picture` at the video's size, copied out for the encoder. */
async function scale(libav: LibAV, video: Video, picture: number): Promise<LibAVFrame> {
  // A window resized mid-scroll: scale the new size to the video's.
  const source = await sourceOf(libav, picture);
  if (
    source.width !== video.source.width ||
    source.height !== video.source.height ||
    source.format !== video.source.format
  ) {
    await libav.sws_freeContext(video.sws);
    video.sws = await scalerFor(libav, source, video.width, video.height);
    video.source = source;
  }

  await libav.av_frame_unref(video.scaled);
  await libav.AVFrame_format_s(video.scaled, libav.AV_PIX_FMT_YUV420P);
  await libav.AVFrame_width_s(video.scaled, video.width);
  await libav.AVFrame_height_s(video.scaled, video.height);
  await libav.av_frame_get_buffer(video.scaled, 0);
  await libav.sws_scale_frame(video.sws, video.scaled, picture);
  return libav.ff_copyout_frame(video.scaled);
}

async function closeVideo(libav: LibAV, video: Video): Promise<void> {
  await libav.ff_free_muxer(video.oc, video.pb);
  await libav.ff_free_encoder(video.ctx, video.frame, video.pkt);
  await libav.sws_freeContext(video.sws);
  await libav.av_frame_free_js(video.scaled);
}
