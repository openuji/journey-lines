import type { ClipSink } from '@openuji/core';

/**
 * What the recorder side and the encoder side of a clip sink say to each
 * other: `ClipEncoder`'s calls, carried to wherever encoding runs, one encoder
 * per `clip`. Encoder words only. Which frames belong to a scroll or a click,
 * and whether it was recorded, is the domain's (`ClipWrite`); `clipSinkOver` is the one
 * place that translates.
 *
 * Plain JSON, so any channel carries it: a worker port, a MessagePort, an
 * extension's `chrome.runtime.Port`. The recorder side decides every time; the
 * encoder encodes what it is given, so the trace and the video cannot disagree.
 */

/** Recorder → encoder. */
export type ToEncoder =
  /** The next picture of `clip`, a PNG in base64, shown from `atMs` into the video. */
  | Readonly<{ type: 'add'; clip: string; png: string; atMs: number }>
  /** `clip` is complete: its last picture stays until `endMs`. */
  | Readonly<{ type: 'finish'; clip: string; endMs: number }>
  /** `clip` is not wanted: free it, no file. */
  | Readonly<{ type: 'abort'; clip: string }>;

/** Encoder → recorder: how a finished clip turned out. */
export type FromEncoder =
  /** `file`: the encoded video, base64. */
  | Readonly<{ type: 'finished'; clip: string; mimeType: string; file: string }>
  | Readonly<{ type: 'failed'; clip: string; message: string }>;

/** One end of a two-way message channel. */
export interface Channel<In, Out> {
  post(message: Out): void;
  /** Returns how to stop listening. */
  listen(on: (message: In) => void): () => void;
}

/** What a host provides when its recording makes videos: an encoder in a worker, as a sink. */
export type ClipWorker = Readonly<{
  sink: ClipSink;
  /** Ends the worker. Call after the recording has drained the sink. */
  close(): Promise<void>;
}>;
