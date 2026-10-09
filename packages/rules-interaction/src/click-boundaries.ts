import type { FrameSample } from './visual.js';

export const CLICK_TIMING = {
  reportLookbackMs: 100,
  boundaryWaitMs: 250,
} as const;

export type InputTime = Readonly<{ happenedAtMs?: number; receivedAtMs: number }>;
export type CommittedBoundary = Readonly<{
  kind: 'committed';
  sample: FrameSample | null;
  placement: 'draw-time' | 'arrival';
}>;
type ProvisionalBoundary = Readonly<{
  kind: 'provisional';
  input: InputTime;
  candidate: FrameSample | null;
}>;
export type InputBoundary = ProvisionalBoundary | CommittedBoundary;

/** Unknown timing is absence of evidence, not evidence of an after-input frame. */
function relativeToInput(sample: FrameSample, input: InputTime): 'at-or-before' | 'after' | 'unknown' {
  const { drawnAtMs } = sample.frame;
  if (drawnAtMs === undefined || input.happenedAtMs === undefined) return 'unknown';
  return drawnAtMs <= input.happenedAtMs ? 'at-or-before' : 'after';
}

/** Starting observation never commits a boundary, even with arrival-only evidence. */
export function boundaryAt(history: readonly FrameSample[], input: InputTime): InputBoundary {
  const candidate = [...history].reverse().find((sample) => relativeToInput(sample, input) !== 'after') ?? null;
  return { kind: 'provisional', input, candidate };
}

export function observeBoundary(boundary: InputBoundary, sample: FrameSample): InputBoundary {
  if (boundary.kind === 'committed') return boundary;
  if (relativeToInput(sample, boundary.input) !== 'at-or-before') return boundary;
  return { ...boundary, candidate: sample };
}

/** Called when publishing: the selected value must survive on the successor. */
export function commitBoundary(boundary: InputBoundary): CommittedBoundary {
  if (boundary.kind === 'committed') return boundary;
  const { candidate, input } = boundary;
  return {
    kind: 'committed', sample: candidate,
    placement: candidate && relativeToInput(candidate, input) === 'at-or-before'
      ? 'draw-time' : 'arrival',
  };
}

export function boundarySample(boundary: InputBoundary): FrameSample | null {
  return boundary.kind === 'committed' ? boundary.sample : boundary.candidate;
}

/**
 * Publication policy for an actual split, not a rule for freezing an active start.
 * Preserve arrival-fallback publication when the latest evidence is untimed.
 * A lone action still accepts later comparable pre-input evidence until it ends.
 */
export function canPublishSplit(
  boundary: InputBoundary, latest: FrameSample | undefined, nowMs: number,
): boolean {
  if (boundary.kind === 'committed') return true;
  if (nowMs - boundary.input.receivedAtMs >= CLICK_TIMING.boundaryWaitMs) return true;
  return latest !== undefined && relativeToInput(latest, boundary.input) !== 'at-or-before';
}
