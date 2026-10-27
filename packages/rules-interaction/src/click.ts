import {
  arrivedAtMs, QUIET_AFTER_MS,
  type DomainEvent, type InteractionEvent, type MilestoneCapture,
  type PressEvent, type TargetElementMeta, type ViewState,
} from '@journey-lines/core';
import { captureFor, type MilestoneRule, type RuleContext } from '@journey-lines/engine';
import { CLICK_TIMING, boundaryAt, boundarySample, commitBoundary, observeBoundary, canPublishSplit,
  type InputBoundary, type CommittedBoundary } from './click-boundaries.js';
import { clickClipWrites } from './click-clip.js';
import type { InteractionResult, InteractionOutput, FrameSample, FrameRange } from './visual.js';
import { episodeLabel, InteractionLabel } from './episode.js';

type ClickSelection =
  | (FrameRange & Readonly<{ kind: 'range' }>)
  | Readonly<{
      kind: 'endpoints';
      before: FrameSample | null;
      after: FrameSample | null;
    }>;

/** Select from evidence before constructing captures. */
function selectClickFrames(
  history: readonly FrameSample[],
  before: FrameSample | null,
  after: FrameSample | null,
): ClickSelection {
  if (!before || !after || before.frame === after.frame) {
    return { kind: 'endpoints', before, after };
  }
  const first = history.findIndex((sample) => sample.frame === before.frame);
  const last = history.findIndex((sample) => sample.frame === after.frame);
  // Preserve current best-effort still captures if a full range is unavailable.
  // Tests must detect accidental eviction of a range that should be retained.
  if (first < 0 || last <= first) return { kind: 'endpoints', before, after };
  return { kind: 'range', before, between: history.slice(first + 1, last), after };
}

// Provenance affects metadata/pre availability; it is not four lifecycles.
type ClickSource =
  | Readonly<{ kind: 'press'; pressId: string; inputKind: PressEvent['kind']; detail?: string }>
  | Readonly<{ kind: 'script' }>
  | Readonly<{ kind: 'browser-without-press' }>
  | Readonly<{ kind: 'unspecified-click' }>;

type ClickFacts = Readonly<{
  clipId: string;
  episode: number;
  target: TargetElementMeta;
  origin: ViewState;
  source: ClickSource;
}>;

type PendingSegment = Readonly<{
  facts: ClickFacts;
  start: InputBoundary; // Exists even when the action's own pre-capture is unavailable.
  beganMs: number;
  /** Null while held; release time or standalone-action arrival otherwise. */
  quietEligibleAtMs: number | null;
}>;

export type ClickEpisodeState = Readonly<{
  episodeCount: number;
  frameHistory: readonly FrameSample[];
  // Last entry is observing. Each earlier entry ends at its successor's start.
  pending: readonly PendingSegment[];
}>;

type ClickEndReason = 'visual-rest' | 'next-action' | 'observation-limit' | 'recording-stopped' | 'tab-left';
type ResolvedClick = Readonly<{
  facts: ClickFacts;
  placement: CommittedBoundary['placement'];
  selection: ClickSelection;
  ending: ClickEndReason;
  endedIn: ViewState;
}>;
type ClickProgress = Readonly<{ state: ClickEpisodeState; completed: readonly ResolvedClick[] }>;
const INITIAL: ClickEpisodeState = { episodeCount: 0, frameHistory: [], pending: [] };

function sourceOf(event: PressEvent | InteractionEvent): ClickSource | null {
  if (event.type === 'press') return {
    kind: 'press', pressId: event.pressId, inputKind: event.kind, detail: event.detail,
  };
  if (event.action !== 'click') return null;
  if (event.trusted === false) return { kind: 'script' };
  if (event.pressId !== undefined) return null;
  return event.trusted === true
    ? { kind: 'browser-without-press' } : { kind: 'unspecified-click' };
}

function resolveClick(
  click: PendingSegment, end: FrameSample | null, ending: ClickEndReason,
  endedIn: ViewState, history: readonly FrameSample[],
): ResolvedClick {
  const start = commitBoundary(click.start);
  const before = click.facts.source.kind === 'browser-without-press' ? null : start.sample;
  return {
    facts: click.facts, placement: start.placement,
    selection: selectClickFrames(history, before, end), ending, endedIn,
  };
}

/** Consume only ready splits, installing the final cut on the successor. */
function completeReadySplits(state: ClickEpisodeState, nowMs: number): ClickProgress {
  let pending = state.pending;
  const completed: ResolvedClick[] = [];
  while (pending.length >= 2) {
    const predecessor = pending[0]!;
    const successor = pending[1]!;
    if (!canPublishSplit(successor.start, state.frameHistory.at(-1), nowMs)) break;
    const end = boundarySample(successor.start);
    completed.push(resolveClick(predecessor, end, 'next-action', successor.facts.origin, state.frameHistory));
    // A missing endpoint publishes no shared picture. The successor can still
    // acquire its pre-frame; no already-published endpoint would be revised.
    const start = end === null ? successor.start : commitBoundary(successor.start);
    pending = [{ ...successor, start }, ...pending.slice(2)];
  }
  return { state: { ...state, pending }, completed };
}

/** Publishing the tail seals the chain of shared cuts leading to it. */
function completePendingSegments(state: ClickEpisodeState, ending: ClickEndReason, view: ViewState): ClickProgress {
  const committed = state.pending.map((click) => ({ ...click, start: commitBoundary(click.start) }));
  const last = state.frameHistory.at(-1) ?? null;
  const completed = committed.map((click, index): ResolvedClick => {
    const successor = committed[index + 1];
    return successor
      ? resolveClick(click, successor.start.sample, 'next-action', successor.facts.origin, state.frameHistory)
      : resolveClick(click, last, ending, view, state.frameHistory);
  });
  return { state: { ...state, pending: [] }, completed };
}

function elapsedEndReason(state: ClickEpisodeState, nowMs: number, timing: ClickTiming): ClickEndReason | null {
  const observing = state.pending.at(-1);
  if (!observing) return null;
  const lastFrameMs = state.frameHistory.at(-1)?.frame.receivedAtMs ?? -Infinity;
  const rested = observing.quietEligibleAtMs !== null &&
    nowMs - Math.max(observing.quietEligibleAtMs, lastFrameMs) >= timing.quietAfterMs;
  if (rested) return 'visual-rest';
  return nowMs - observing.beganMs >= timing.stillMovingMs ? 'observation-limit' : null;
}

function observeFrame(state: ClickEpisodeState, sample: FrameSample): ClickEpisodeState {
  return {
    ...state,
    frameHistory: [...state.frameHistory, sample],
    pending: state.pending.map((click) => ({ ...click, start: observeBoundary(click.start, sample) })),
  };
}

function startSegment(
  state: ClickEpisodeState, event: PressEvent | InteractionEvent,
  source: ClickSource, view: ViewState, ruleId: string,
): ClickEpisodeState {
  const episode = state.episodeCount + 1;
  const clipId = source.kind === 'press'
    ? `${ruleId}-${source.pressId}` : `${ruleId}-v${view.id}-c${episode}`;
  return {
    ...state, episodeCount: episode,
    pending: [...state.pending, {
      facts: { clipId, episode, target: event.target, origin: view, source },
      start: boundaryAt(state.frameHistory, event),
      beganMs: event.receivedAtMs,
      quietEligibleAtMs: source.kind === 'press' ? null : event.receivedAtMs,
    }],
  };
}

function releasePress(state: ClickEpisodeState, pressId: string, atMs: number): ClickEpisodeState {
  const observing = state.pending.at(-1);
  if (!observing || observing.facts.source.kind !== 'press' || observing.facts.source.pressId !== pressId) return state;
  return {
    ...state,
    pending: [...state.pending.slice(0, -1), { ...observing, quietEligibleAtMs: atMs }],
  };
}

function trimHistory(state: ClickEpisodeState): ClickEpisodeState {
  const last = state.frameHistory.at(-1);
  if (!last) return state;
  const recent = state.frameHistory.findIndex((sample) =>
    last.frame.receivedAtMs - sample.frame.receivedAtMs < CLICK_TIMING.reportLookbackMs);
  let from = Math.max(0, recent - 1);
  for (const click of state.pending) {
    const sample = boundarySample(click.start);
    const index = sample ? state.frameHistory.indexOf(sample) : -1;
    if (index >= 0) from = Math.min(from, index);
  }
  return { ...state, frameHistory: state.frameHistory.slice(from) };
}

function advanceClick(
  state: ClickEpisodeState, event: DomainEvent, context: RuleContext,
  ruleId: string, timing: ClickTiming,
): ClickProgress {
  const { currentView, currentFrame } = context;
  if (event.type === 'stop' || (event.type === 'view-exit' && event.nextEntry === 'tab')) {
    const result = completePendingSegments(state, event.type === 'stop' ? 'recording-stopped' : 'tab-left', currentView);
    return { ...result, state: { ...result.state, frameHistory: [] } };
  }
  const nowMs = arrivedAtMs(event);
  const earlier = completeReadySplits(state, nowMs);
  const ending = elapsedEndReason(earlier.state, nowMs, timing);
  const elapsed = ending ? completePendingSegments(earlier.state, ending, currentView)
    : { state: earlier.state, completed: [] };
  let next = elapsed.state;
  if (currentFrame) next = observeFrame(next, { frame: currentFrame, position: currentView.position });
  if (event.type === 'press' || event.type === 'interaction') {
    const source = sourceOf(event);
    if (source) next = startSegment(next, event, source, currentView, ruleId);
  }
  if (event.type === 'press-ended') next = releasePress(next, event.pressId, event.receivedAtMs);
  const ready = completeReadySplits(next, nowMs);
  return {
    state: trimHistory(ready.state),
    completed: [...earlier.completed, ...elapsed.completed, ...ready.completed],
  };
}

/** Presentation has no pending-state, frame-history, or lifecycle access. */
function presentClick(click: ResolvedClick, limitMs: number): InteractionOutput {
  const { facts, selection, ending, endedIn, placement } = click;
  const { origin, episode, target, source } = facts;
  const { before, after } = selection;
  const arrival = source.kind !== 'browser-without-press' && placement === 'arrival'
    ? '; placed by arrival' : '';
  const pressedWith = source.kind === 'press' && source.inputKind === 'key'
    ? `, pressed with ${source.detail ?? 'a key'}` : '';
  const descriptions: Record<ClickEndReason, string> = {
    'visual-rest': 'Where the visual response came to rest',
    'next-action': 'Screen before the next interaction',
    'observation-limit': `Screen ${limitMs / 1000} s after the press; observation limit reached`,
    'recording-stopped': 'Last observed screen when recording stopped',
    'tab-left': 'Last observed screen before leaving the tab',
  };
  const legacyEndDescription: Record<ClickEndReason, string> = {
    'visual-rest': 'rested',
    'next-action': 'next press',
    'observation-limit': 'limit',
    'recording-stopped': 'stopped',
    'tab-left': 'left for another tab',
  };
  const pre = before ? captureFor(origin, {
    label: episodeLabel(InteractionLabel.preClick, episode), frame: before.frame, position: before.position ?? undefined,
    detail: `Before interacting with <${target.selector}> "${target.textSnippet ?? ''}"${pressedWith}` +
      (source.kind === 'script' ? ", clicked by the page's own code" : '') + arrival +
      (after ? '' : `; the recording ${legacyEndDescription[ending]} before the response came to rest`),
    domTarget: target,
  }) : undefined;
  const sameView = origin.id === endedIn.id;
  const postOf = (sample: FrameSample): MilestoneCapture => captureFor(sameView ? endedIn : origin, {
    label: episodeLabel(InteractionLabel.postClick, episode), frame: sample.frame, position: sample.position ?? undefined,
    detail: `${descriptions[ending]}, after interacting with <${target.selector}>` +
      (before?.frame === sample.frame ? '; nothing changed on screen' : '') +
      (source.kind === 'browser-without-press' ? '; no press was reported before this click, so no pre-click' : '') +
      arrival + (sameView ? '' : `, now showing ${endedIn.url}`),
    domTarget: target,
  });
  // Narrowing selection guarantees a post, without assertions or missing-post flags.
  if (selection.kind === 'range') {
    const post = postOf(selection.after);
    return {
      captures: [...(pre ? [pre] : []), post],
      clipWrites: clickClipWrites(facts.clipId, selection, post),
    };
  }
  return { captures: [...(pre ? [pre] : []), ...(after ? [postOf(after)] : [])], clipWrites: [] };
}

export type ClickFrame = FrameSample;
export interface ClickEpisodeOptions {
  readonly id?: string;
  /** How long the released response must remain visually unchanged, ms. */
  readonly quietAfterMs?: number;
  /** Maximum observation window after a press, ms. */
  readonly stillMovingMs?: number;
}

export type ClickTiming = Readonly<{ quietAfterMs: number; stillMovingMs: number }>;
export const CLICK_DEFAULTS = { quietAfterMs: QUIET_AFTER_MS, stillMovingMs: 2_000 } as const;

/** Normalize legacy/partial timing settings before any recording attaches. */
export function parseClickTiming(value: unknown = {}): ClickTiming {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Click timing must contain a visual pause and maximum observation time.');
  }
  const supplied = value as Record<string, unknown>;
  const quietAfterMs = supplied.quietAfterMs === undefined ? CLICK_DEFAULTS.quietAfterMs : supplied.quietAfterMs;
  const stillMovingMs = supplied.stillMovingMs === undefined ? CLICK_DEFAULTS.stillMovingMs : supplied.stillMovingMs;
  const valid = (ms: unknown): ms is number => typeof ms === 'number' && Number.isSafeInteger(ms) && ms > 0 && ms <= 2_147_483_647;
  if (!valid(quietAfterMs)) throw new Error('Click visual pause must be a positive integer number of milliseconds, at most 2147483647.');
  if (!valid(stillMovingMs)) throw new Error('Maximum click observation time must be a positive integer number of milliseconds, at most 2147483647.');
  if (stillMovingMs < quietAfterMs) throw new Error('Maximum click observation time must be at least as long as the visual pause.');
  return { quietAfterMs, stillMovingMs };
}
/**
 * Each press starts one segment. The next independent action ends it at the
 * same frame that starts the next segment. The last segment ends after its
 * release and visual quiet, the observation limit, or the end of observation
 * at Stop/tab exit. A click naming a press does not create another segment;
 * a standalone page click is its own cause.
 *
 * A boundary can arrive before its picture or after frames drawn beyond it.
 * Keep those frames until the boundary is known, then derive screenshots and
 * video from the same range. Nothing is encoded beyond a still-undecided end.
 * Existing 10/11 labels are retained for recordings and their consumers.
 */
export function clickEpisodeRule(
  { id = 'click-episode', ...options }: ClickEpisodeOptions = {},
): MilestoneRule<ClickEpisodeState> {
  const timing = parseClickTiming(options);
  return {
    id,
    init: (view, previous) => !previous || view.entry === 'tab'
      ? INITIAL : { ...previous, episodeCount: 0 },
    evaluate: (state, event, context): InteractionResult<ClickEpisodeState> => {
      const result = advanceClick(state, event, context, id, timing);
      const output = result.completed.map((click) => presentClick(click, timing.stillMovingMs));
      return {
        nextState: result.state,
        captures: output.flatMap((part) => part.captures),
        clipWrites: output.flatMap((part) => part.clipWrites),
      };
    },
  };
}
export const ClickEpisodeRule = clickEpisodeRule();
