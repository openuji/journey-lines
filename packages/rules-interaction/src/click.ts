import {
  arrivedAtMs,
  QUIET_AFTER_MS,
  type CompositorFrame,
  type PagePosition,
  type PressEvent,
  type TargetElementMeta,
  type ViewState,
} from '@openuji/core';
import { captureFor, type MilestoneRule, type RuleResult } from '@openuji/engine';
import { episodeLabel, InteractionLabel } from './episode.js';
import { clickClipWrites } from './click-clip.js';
import { REPORT_SLACK_MS } from './scroll.js';

type When = Readonly<{ atMs?: number; arrivedMs: number }>;
type Boundary = Readonly<{ when: When; before: CompositorFrame | null }>;

/** Keep the position that belonged to a frame, even when it is encoded later. */
export type ClickFrame = Readonly<{ frame: CompositorFrame; position: PagePosition | null }>;

/** One press's visual segment. A native click is not needed to create or keep it. */
export type OpenClick = Readonly<{
  episode: number;
  target: TargetElementMeta;
  view: ViewState;
  /** Null only for a browser click whose press was not observed. */
  cause: Boundary | null;
  press?: Readonly<{ pressId: string; kind: PressEvent['kind']; detail?: string }>;
  byPage: boolean;
  beganMs: number;
  /** A held gesture can still change the screen on release. */
  releasedAtMs: number | null;
}>;

/** A segment ended at the next action; only its boundary frame may still be in flight. */
type Closing = Readonly<{ segment: OpenClick; boundary: Boundary; view: ViewState }>;

export type ClickEpisodeState = Readonly<{
  episodeCount: number;
  /** Frames for the active segment and any boundary still awaiting its picture. */
  seen: readonly ClickFrame[];
  open: OpenClick | null;
  closing: readonly Closing[];
}>;

export interface ClickEpisodeOptions {
  readonly id?: string;
  /** Maximum observation window after a press, ms. */
  readonly stillMovingMs?: number;
}

export const CLICK_DEFAULTS = { stillMovingMs: 2_000 } as const;
const INITIAL: ClickEpisodeState = { episodeCount: 0, seen: [], open: null, closing: [] };
type Ending = 'rested' | 'next press' | 'limit' | 'stopped' | 'left for another tab';

function comparable(frame: CompositorFrame, when: When): boolean {
  return when.atMs !== undefined && frame.drawnAtMs !== undefined;
}

/** The frame before an input, by draw time where known and by arrival otherwise. */
function boundaryAt(seen: readonly ClickFrame[], when: When): Boundary {
  const before = [...seen].reverse().find(({ frame }) =>
    !comparable(frame, when) || frame.drawnAtMs! <= when.atMs!,
  )?.frame ?? null;
  return { when, before };
}

/** Ordered frames let a late picture correct a boundary until the first one drawn after it. */
function later(boundary: Boundary, frame: CompositorFrame): Boundary {
  return comparable(frame, boundary.when) && frame.drawnAtMs! <= boundary.when.atMs!
    ? { ...boundary, before: frame }
    : boundary;
}

function seenWith(state: ClickEpisodeState, sample: ClickFrame): ClickEpisodeState {
  const update = (segment: OpenClick): OpenClick => ({
    ...segment,
    cause: segment.cause && later(segment.cause, sample.frame),
  });
  return {
    ...state,
    seen: [...state.seen, sample],
    open: state.open && update(state.open),
    closing: state.closing.map(({ segment, boundary, view }) => ({
      segment: update(segment), boundary: later(boundary, sample.frame), view,
    })),
  };
}

/** Release completed spans, retaining the short lookback needed for the next press's report. */
function trim(state: ClickEpisodeState): ClickEpisodeState {
  const { seen } = state;
  const last = seen.at(-1)?.frame;
  if (!last) return state;
  let from = Math.max(0, seen.findIndex(({ frame }) => last.receivedAtMs - frame.receivedAtMs < REPORT_SLACK_MS) - 1);
  for (const segment of [...state.closing.map((end) => end.segment), ...(state.open ? [state.open] : [])]) {
    const before = segment.cause?.before;
    if (before) {
      const index = seen.findIndex(({ frame }) => frame === before);
      if (index >= 0) from = Math.min(from, index);
    }
  }
  return { ...state, seen: seen.slice(from) };
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
export function clickEpisodeRule(options: ClickEpisodeOptions = {}): MilestoneRule<ClickEpisodeState> {
  const { id = 'click-episode', stillMovingMs = CLICK_DEFAULTS.stillMovingMs } = options;
  const descriptions: Readonly<Record<Ending, string>> = {
    rested: 'Where the visual response came to rest',
    'next press': 'Screen before the next interaction',
    limit: `Screen ${stillMovingMs / 1000} s after the press; observation limit reached`,
    stopped: 'Last observed screen when recording stopped',
    'left for another tab': 'Last observed screen before leaving the tab',
  };

  return {
    id,
    init: (view, previous) =>
      !previous || view.entry === 'tab' ? INITIAL : { ...previous, episodeCount: 0 },
    evaluate: (state, event, { currentView, currentFrame }): RuleResult<ClickEpisodeState> => {
      let next = state;
      const captures: RuleResult<ClickEpisodeState>['captures'][number][] = [];
      const clipWrites: NonNullable<RuleResult<ClickEpisodeState>['clipWrites']>[number][] = [];

      const finish = (segment: OpenClick, after: CompositorFrame | null, ending: Ending, view: ViewState): void => {
        const before = segment.cause?.before ?? null;
        const { target, episode } = segment;
        const sameView = segment.view.id === view.id;
        const arrival = segment.cause && (segment.cause.when.atMs === undefined || before?.drawnAtMs === undefined)
          ? '; placed by arrival' : '';
        const pressedWith = segment.press?.kind === 'key' ? `, pressed with ${segment.press.detail ?? 'a key'}` : '';
        const pre = before ? captureFor(segment.view, {
          label: episodeLabel(InteractionLabel.preClick, episode),
          frame: before,
          detail: `Before interacting with <${target.selector}> "${target.textSnippet ?? ''}"${pressedWith}` +
            (segment.byPage ? ", clicked by the page's own code" : '') + arrival +
            (after ? '' : `; the recording ${ending} before the response came to rest`),
          domTarget: target,
        }) : undefined;
        const post = after ? captureFor(sameView ? view : segment.view, {
          label: episodeLabel(InteractionLabel.postClick, episode),
          frame: after,
          detail: `${descriptions[ending]}, after interacting with <${target.selector}>` +
            (before === after ? '; nothing changed on screen' : '') +
            (segment.cause === null ? '; no press was reported before this click, so no pre-click' : '') +
            arrival + (sameView ? '' : `, now showing ${view.url}`),
          domTarget: target,
        }) : undefined;
        if (pre) captures.push(pre);
        if (post) captures.push(post);
        const clipId = segment.press ? `${id}-${segment.press.pressId}` : `${id}-v${segment.view.id}-c${episode}`;
        clipWrites.push(...clickClipWrites(clipId, next.seen, pre, post));
      };

      const flush = (nowMs: number, force = false): void => {
        const last = next.seen.at(-1)?.frame;
        const waiting: Closing[] = [];
        for (const ended of next.closing) {
          const { boundary, segment, view } = ended;
          // Once a later frame arrived, the boundary is final. If no more
          // pictures arrive, the normal quiet allowance sees out delivery.
          const ready = force || nowMs - boundary.when.arrivedMs >= QUIET_AFTER_MS ||
            (last && (!comparable(last, boundary.when) || last.drawnAtMs! > boundary.when.atMs!));
          if (ready) finish(segment, boundary.before, 'next press', view);
          else waiting.push(ended);
        }
        next = { ...next, closing: waiting };
      };

      const leaving = event.type === 'view-exit' && event.nextEntry === 'tab';
      if (event.type === 'stop' || leaving) {
        const ending = event.type === 'stop' ? 'stopped' : 'left for another tab';
        // Observation ended. Preserve what arrived, even if release or rest
        // never did; a delayed tab report must not turn the exit into rest.
        flush(Infinity, true);
        if (next.open) finish(next.open, next.seen.at(-1)?.frame ?? null, ending, currentView);
        return { nextState: { ...next, open: null, closing: [], seen: [] }, captures, clipWrites };
      }

      const nowMs = arrivedAtMs(event);
      flush(nowMs);
      const open = next.open;
      if (open) {
        const lastFrameMs = next.seen.at(-1)?.frame.receivedAtMs ?? -Infinity;
        const rested = open.releasedAtMs !== null && nowMs - Math.max(open.releasedAtMs, lastFrameMs) >= QUIET_AFTER_MS;
        const limited = nowMs - open.beganMs >= stillMovingMs;
        if (rested || limited) {
          finish(open, next.seen.at(-1)?.frame ?? null, rested ? 'rested' : 'limit', currentView);
          next = { ...next, open: null };
        }
      }

      if (currentFrame) next = seenWith(next, { frame: currentFrame, position: currentView.position });

      const standalone = event.type === 'interaction' && event.action === 'click' &&
        (event.trusted === false || event.pressId === undefined);
      if (event.type === 'press' || standalone) {
        const boundary = boundaryAt(next.seen, { atMs: event.happenedAtMs, arrivedMs: event.receivedAtMs });
        const episode = next.episodeCount + 1;
        const segment: OpenClick = {
          episode,
          target: event.target,
          view: currentView,
          cause: event.type === 'press' || event.trusted !== true ? boundary : null,
          ...(event.type === 'press' ? { press: { pressId: event.pressId, kind: event.kind, detail: event.detail } } : {}),
          byPage: event.type === 'interaction' && event.trusted === false,
          beganMs: event.receivedAtMs,
          releasedAtMs: event.type === 'press' ? null : event.receivedAtMs,
        };
        next = {
          ...next,
          episodeCount: episode,
          closing: next.open ? [...next.closing, { segment: next.open, boundary, view: currentView }] : next.closing,
          open: segment,
        };
      }
      if (event.type === 'press-ended' && next.open?.press?.pressId === event.pressId) {
        next = { ...next, open: { ...next.open, releasedAtMs: event.receivedAtMs } };
      }
      flush(nowMs);
      return { nextState: trim(next), captures, clipWrites };
    },
  };
}

export const ClickEpisodeRule = clickEpisodeRule();
