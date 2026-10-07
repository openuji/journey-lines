/**
 * Types for the part of libav.js the clip encoder uses, nothing more. The
 * whole API: https://github.com/Yahweasel/libav.js/blob/v6.10.9.0/docs/API.md
 * (pointers are plain numbers into the WebAssembly heap).
 */

export interface LibAVFrame {
  data: Uint8Array;
  format: number;
  width?: number;
  height?: number;
  layout?: { offset: number; stride: number }[];
  pts?: number;
  /** High 32 bits of `pts`; libav.js reads both. */
  ptshi?: number;
}

export interface LibAVPacket {
  data: Uint8Array;
  pts?: number;
  ptshi?: number;
}

export interface LibAV {
  readonly AV_PIX_FMT_YUV420P: number;
  readonly AV_LOG_WARNING: number;

  av_log_set_level(level: number): Promise<void>;

  ff_init_decoder(name: string): Promise<[codec: number, ctx: number, pkt: number, frame: number]>;
  ff_decode_multi(
    ctx: number,
    pkt: number,
    frame: number,
    packets: LibAVPacket[],
    config: { copyoutFrame: 'ptr' },
  ): Promise<number[]>;
  ff_free_decoder(ctx: number, pkt: number, frame: number): Promise<void>;

  ff_init_encoder(
    name: string,
    opts: {
      ctx: Record<string, number>;
      time_base: [number, number];
      options: Record<string, string>;
    },
  ): Promise<[codec: number, ctx: number, frame: number, pkt: number, frameSize: number]>;
  ff_encode_multi(
    ctx: number,
    frame: number,
    pkt: number,
    frames: LibAVFrame[],
    fin?: boolean,
  ): Promise<LibAVPacket[]>;
  ff_free_encoder(ctx: number, frame: number, pkt: number): Promise<void>;

  ff_init_muxer(
    opts: { format_name: string; filename: string; open: boolean },
    streams: [ctx: number, timeBaseNum: number, timeBaseDen: number][],
  ): Promise<[oc: number, format: number, pb: number, streams: number[]]>;
  avformat_write_header(oc: number, options: number): Promise<number>;
  ff_write_multi(oc: number, pkt: number, packets: LibAVPacket[]): Promise<void>;
  av_write_trailer(oc: number): Promise<number>;
  ff_free_muxer(oc: number, pb: number): Promise<void>;

  av_frame_alloc(): Promise<number>;
  av_frame_free_js(frame: number): Promise<void>;
  av_frame_unref(frame: number): Promise<void>;
  av_frame_get_buffer(frame: number, align: number): Promise<number>;
  AVFrame_width(frame: number): Promise<number>;
  AVFrame_height(frame: number): Promise<number>;
  AVFrame_format(frame: number): Promise<number>;
  AVFrame_width_s(frame: number, value: number): Promise<void>;
  AVFrame_height_s(frame: number, value: number): Promise<void>;
  AVFrame_format_s(frame: number, value: number): Promise<void>;
  ff_copyout_frame(frame: number): Promise<LibAVFrame>;

  sws_getContext(
    srcW: number,
    srcH: number,
    srcFormat: number,
    dstW: number,
    dstH: number,
    dstFormat: number,
    flags: number,
    srcFilter: number,
    dstFilter: number,
    param: number,
  ): Promise<number>;
  sws_scale_frame(ctx: number, dst: number, src: number): Promise<number>;
  sws_freeContext(ctx: number): Promise<void>;

  readFile(name: string): Promise<Uint8Array>;
  unlink(name: string): Promise<void>;
}

export interface LibAVWrapper {
  /** `base`: where the `.wasm.mjs` and `.wasm` files are; defaults to this file's directory. */
  LibAV(opts: { noworker: true; nothreads: true; base?: string }): Promise<LibAV>;
}

declare const libav: LibAVWrapper;
export default libav;
