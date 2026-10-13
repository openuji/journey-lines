import type { ClipTraceSample } from '@openuji/core';

/** A clip as a browser plays it: where its video is, and when each frame was recorded. */
export type PlayableClip = Readonly<{ src: string; trace: readonly ClipTraceSample[] }>;
