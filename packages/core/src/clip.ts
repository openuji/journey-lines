import type { CompositorFrame, MilestoneCapture } from './domain.js';

/**
 * Clips: a video of a span of the page. Today the span is a scroll.
 *
 * A rule never makes a video. It says which frames belong to a span, as
 * `ClipWrite`s returned next to its captures, and the pipeline delivers them
 * to a `ClipSink`. Whether a recording makes videos at all is the host's
 * setting: which `ClipSink` it hands over, `noClips` by default.
 */

/** Which capture a clip belongs to; together unique within a recording. */
export type ClipFiling = Pick<
  MilestoneCapture,
  'viewId' | 'entry' | 'documentId' | 'loaderId' | 'url' | 'label'
>;

/**
 * What a rule says about a span: each frame once, in order, as soon as the
 * rule knows it belongs; then whether the span is kept. Data, like a capture.
 */
export type ClipWrite =
  /** The next frame of clip `id`. The first one opens it. */
  | Readonly<{ type: 'frame'; id: string; frame: CompositorFrame }>
  /** Clip `id` is complete. `capture` is the capture it belongs to. */
  | Readonly<{ type: 'keep'; id: string; capture: MilestoneCapture }>
  /** Clip `id` is not kept: forget it. */
  | Readonly<{ type: 'drop'; id: string }>;

/**
 * Where clip writes go. Like `CaptureSink`, `enqueue` must return at once: it
 * is called from inside the event consumer loop. Real work settles in `drain`.
 */
export interface ClipSink {
  readonly name: string;
  enqueue(write: ClipWrite): void;
  /** Await every kept clip. Rejects if any failed. */
  drain(): Promise<void>;
}

/** The recording makes no videos: every write is discarded. */
export const noClips: ClipSink = {
  name: 'no-clips',
  enqueue: () => {},
  drain: async () => {},
};

/** Where one frame of a clip sits in its video, and where the page was in it. */
export type ClipTraceSample = Readonly<{
  frameIndex: number;
  /** Time in the video, ms from its start. */
  atMs: number;
  /** The page's offset as the frame reported it; it can trail the picture. */
  x: number;
  y: number;
}>;

/**
 * A kept clip, encoded, filed like the capture it belongs to. Its frame count
 * and duration derive from `trace`.
 */
export type Clip = Readonly<
  ClipFiling & {
    /** E.g. `video/webm`. */
    mimeType: string;
    /** The encoded file, base64 like frames. */
    base64: string;
    /** One sample per frame of the video, in order. */
    trace: readonly ClipTraceSample[];
  }
>;
