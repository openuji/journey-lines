import type { ClipWrite, CompositorFrame, MilestoneCapture, PagePosition } from '@openuji/core';

/** Evidence at frame arrival, retained unchanged when encoding is deferred. */
export type FrameSample = Readonly<{
  frame: CompositorFrame;
  position: PagePosition | null;
}>;

/** A selected range, including its shared endpoint samples. */
export type FrameRange = Readonly<{
  before: FrameSample;
  between: readonly FrameSample[];
  after: FrameSample;
}>;

/** The existing engine output, with clipWrites always present in these rules. */
export type InteractionOutput = Readonly<{
  captures: readonly MilestoneCapture[];
  clipWrites: readonly ClipWrite[];
}>;

export type InteractionResult<State> = InteractionOutput & Readonly<{ nextState: State }>;

export function frameWrites(id: string, samples: readonly FrameSample[]): readonly ClipWrite[] {
  return samples.map(({ frame, position }) => ({ type: 'frame', id, frame, position }));
}
