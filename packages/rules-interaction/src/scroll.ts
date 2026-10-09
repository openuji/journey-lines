import {
  arrivedAtMs, QUIET_AFTER_MS,
  type MilestoneCapture, type CompositorFrame, type DomainEvent, type PagePosition,
  type PageScrollEvent, type ScrollSample, type ScrollStart, type ViewState,
} from '@openuji/core';
import { captureFor, type MilestoneRule, type RuleContext } from '@openuji/engine';
import { scrollClipWrites } from './scroll-clip.js';
import type { ScrollEvidence } from './scroll-evidence.js';
import type { InteractionResult, FrameSample } from './visual.js';
import { episodeLabel, InteractionLabel } from './episode.js';

/**
 * How far apart a picture and the page's report about it can arrive, either
 * way round, ms. Measured on Chrome 154: headed, the report came first by
 * 17–50 ms; in headless-shell the picture came first by 6–8 ms; on a busy
 * page a picture changed 67 ms before the report (its scrollbar only).
 */
export const REPORT_SLACK_MS = 100;
export const SCROLL_DEFAULTS = { minScrollPx: 8, silentEndMs: 1_000 } as const;

type ScrollPath = readonly [ScrollSample, ...ScrollSample[]];

type OpenScroll = Readonly<{
  clipId: string;
  cause: ScrollStart;
  start: FrameSample;
  from: PagePosition | null;
  path: ScrollPath;
  /** Whether the latest page report was scrollend; its time is in path. */
  endReported: boolean;
  last: FrameSample;
  unconfirmedFrames: readonly FrameSample[];
}>;
export type ScrollEpisodeState = Readonly<{
  episodeCount: number; // Kept captures: unchanged public numbering.
  candidateCount: number; // Opened candidates: unique internal clip identities.
  beganMs: number | null;
  cause: (ScrollStart & Readonly<{ atMs: number }>) | null;
  rest: FrameSample | null;
  recent: readonly FrameSample[];
  open: OpenScroll | null;
}>;
type ScrollUpdate = Readonly<{
  nextState: ScrollEpisodeState;
  confirmedFrames: readonly FrameSample[];
}>;
type ScrollResult = Readonly<{
  nextState: ScrollEpisodeState;
  captures: readonly MilestoneCapture[];
  evidence: ScrollEvidence | null;
}>;
const INITIAL: ScrollEpisodeState = {
  episodeCount: 0, candidateCount: 0, beganMs: null,
  cause: null, rest: null, recent: [], open: null,
};

function startAt(state: ScrollEpisodeState, atMs: number): {
  start: FrameSample | null; lead: readonly FrameSample[];
} {
  return {
    start: state.recent.filter((sample) =>
      atMs - sample.frame.receivedAtMs >= REPORT_SLACK_MS).at(-1) ?? state.rest,
    lead: state.recent.filter((sample) =>
      atMs - sample.frame.receivedAtMs < REPORT_SLACK_MS),
  };
}

/** A nonempty path always has a final report; TypeScript does not narrow dynamic indices. */
function latestReport(path: ScrollPath): ScrollSample {
  return path[path.length - 1]!;
}

function belongsToScroll(open: OpenScroll, frame: CompositorFrame): boolean {
  const awaitingFirstResponse = open.last === open.start;
  const withinReportAllowance =
    frame.receivedAtMs - latestReport(open.path).receivedAtMs <= REPORT_SLACK_MS;
  return awaitingFirstResponse || withinReportAllowance;
}

/** Decide frame membership and return the newly confirmed evidence. */
function onFrame(state: ScrollEpisodeState, sample: FrameSample): ScrollUpdate {
  const { start, lead } = startAt({ ...state, recent: [...state.recent, sample] }, sample.frame.receivedAtMs);
  const next = { ...state, rest: start, recent: lead };
  const open = state.open;
  if (!open) return { nextState: next, confirmedFrames: [] };
  if (!belongsToScroll(open, sample.frame)) return {
    nextState: { ...next, open: { ...open, unconfirmedFrames: [...open.unconfirmedFrames, sample] } }, confirmedFrames: [],
  };
  return {
    nextState: { ...next, open: { ...open, last: sample } },
    confirmedFrames: [sample],
  };
}

function onReport(state: ScrollEpisodeState, event: PageScrollEvent, view: ViewState, id: string): ScrollUpdate {
  const report: ScrollSample = {
    receivedAtMs: event.receivedAtMs, pageTimeMs: event.pageTimeMs, x: event.x, y: event.y,
  };
  const endReported = event.ended === true;
  const open = state.open;
  if (open) return {
    nextState: { ...state, open: {
      ...open, path: [...open.path, report],
      endReported, last: open.unconfirmedFrames.at(-1) ?? open.last, unconfirmedFrames: [],
    } },
    confirmedFrames: open.unconfirmedFrames,
  };

  const cause = state.cause;
  const caused = cause !== null && event.receivedAtMs - cause.atMs <= QUIET_AFTER_MS;
  const arriving = state.beganMs === null || event.receivedAtMs - state.beganMs < QUIET_AFTER_MS;
  const { start, lead } = startAt(state, event.receivedAtMs);
  if (!caused || arriving || !start) return { nextState: state, confirmedFrames: [] };

  const candidateCount = state.candidateCount + 1;
  const clipId = `${id}-v${view.id}-s${candidateCount}`;
  return {
    nextState: { ...state, candidateCount, open: {
      clipId, cause: { kind: cause.kind, ...(cause.detail ? { detail: cause.detail } : {}) },
      start, from: view.position, path: [report],
      endReported, last: lead.at(-1) ?? start, unconfirmedFrames: [],
    } },
    // startAt already selected membership; retain the selected samples directly.
    confirmedFrames: [start, ...lead],
  };
}

function isOver(open: OpenScroll, atMs: number, silentEndMs: number): boolean {
  const hasResponseFrame = open.last !== open.start;
  const requiredSilenceMs = open.endReported ? QUIET_AFTER_MS : silentEndMs;
  return hasResponseFrame && atMs - latestReport(open.path).receivedAtMs >= requiredSilenceMs;
}

function travelOf({ from, path }: OpenScroll): number {
  const points = from ? [from, ...path] : path;
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    distance += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return distance;
}

const where = ({ x, y }: PagePosition): string => `(${Math.round(x)}, ${Math.round(y)})`;
function by({ kind, detail }: ScrollStart): string {
  switch (kind) {
    case 'wheel': return 'by wheel';
    case 'touch': return 'by touch';
    case 'key': return detail ? `by the ${detail} key` : 'by a key';
    case 'scrollbar': return 'by the scrollbar';
    case 'link': return detail ? `by a link to ${detail}` : 'by a link';
    case 'script': return `by the page's ${detail ?? 'code'}`;
  }
}

/** Return the acceptance decision alongside its captures and confirmed frames. */
function completeScroll(
  state: ScrollEpisodeState, open: OpenScroll, view: ViewState,
  minScrollPx: number, confirmedFrames: readonly FrameSample[],
): ScrollResult {
  const travelledPx = travelOf(open);
  const to = latestReport(open.path);
  const nextState = { ...state, open: null };
  if (travelledPx < minScrollPx) return {
    nextState, captures: [], evidence: {
      episodeId: open.clipId, confirmedFrames, completion: { kind: 'discarded' },
    },
  };
  const episode = state.episodeCount + 1;
  const pre = captureFor(view, {
    label: episodeLabel(InteractionLabel.preScroll, episode), frame: open.start.frame,
    position: open.from ?? undefined,
    detail: `Pre-scroll #${episode} of the page${open.from ? ` at ${where(open.from)}` : ''}`,
  });
  const post = captureFor(view, {
    label: episodeLabel(InteractionLabel.postScroll, episode), frame: open.last.frame,
    detail: `Post-scroll #${episode} of the page: ${open.from ? `${where(open.from)} → ` : 'to '}${where(to)}, ` +
      `travelled ${Math.round(travelledPx)}px, ${by(open.cause)}`,
    scrollEpisode: { path: open.path, cause: open.cause },
  });
  return {
    nextState: { ...nextState, episodeCount: episode }, captures: [pre, post],
    evidence: { episodeId: open.clipId, confirmedFrames, completion: { kind: 'accepted', post } },
  };
}

function advanceScroll(
  state: ScrollEpisodeState, event: DomainEvent, context: RuleContext,
  id: string, minScrollPx: number, silentEndMs: number,
): ScrollResult {
  if (event.type === 'stop' || event.type === 'view-exit') return {
    nextState: { ...state, open: null }, captures: [],
    evidence: state.open ? {
      episodeId: state.open.clipId, confirmedFrames: [], completion: { kind: 'discarded' },
    } : null,
  };
  const atMs = arrivedAtMs(event);
  const timed = state.beganMs === null ? { ...state, beganMs: atMs } : state;
  let step: ScrollUpdate;
  switch (event.type) {
    case 'frame':
      step = onFrame(timed, { frame: event.frame, position: context.currentView.position });
      break;
    case 'page-scroll':
      step = onReport(timed, event, context.currentView, id);
      break;
    case 'scroll-cause':
      step = { nextState: { ...timed, cause: {
        kind: event.kind, ...(event.detail ? { detail: event.detail } : {}), atMs,
      } }, confirmedFrames: [] };
      break;
    default:
      step = { nextState: timed, confirmedFrames: [] };
  }
  const open = step.nextState.open;
  if (open && isOver(open, atMs, silentEndMs)) {
    return completeScroll(step.nextState, open, context.currentView, minScrollPx, step.confirmedFrames);
  }
  return {
    nextState: step.nextState, captures: [], evidence: open ? {
      episodeId: open.clipId, confirmedFrames: step.confirmedFrames, completion: null,
    } : null,
  };
}

export interface ScrollEpisodeOptions {
  readonly id?: string;
  /** A scroll is kept only if the page travelled at least this far, px. */
  readonly minScrollPx?: number;
  /** A scroll whose page has been silent this long, with no `scrollend`, is over too, ms. */
  readonly silentEndMs?: number;
}

/**
 * Captures the frame before and the frame after each scroll of the page.
 *
 * The page says when: it reports its position at every `scroll` and says
 * `scrollend` when Chrome considers the scroll complete. Frames say what was
 * seen. The offset stamped on a frame cannot say when: on a real page it
 * stops changing for up to 660 ms while the page scrolls (Chrome 154).
 *
 *  1. A scroll starts when something scrolls the page — the person's wheel,
 *     touch, key, scrollbar or link, or the page's own code, each reported as
 *     a cause — and the page then reports moving, within `QUIET_AFTER_MS`.
 *     A move without a cause is the page re-laid out (a resize, images
 *     loading above): the page's position updates, no scroll opens. It starts
 *     from the page at rest: the newest frame `REPORT_SLACK_MS` before the
 *     first report, the `03` image (`startAt`).
 *     Reports in a view's first `QUIET_AFTER_MS` are the page arriving, not a
 *     scroll: a router putting the new route at the top, a restored scroll
 *     position. The frame on screen then may still be the previous page's.
 *  2. Every later report extends it, and a report after `scrollend` takes it
 *     up again: a notch spin, or a gesture that moves again, is one scroll.
 *  3. It is over once the page has said `scrollend` and then reported nothing
 *     for `QUIET_AFTER_MS`, or, should `scrollend` never come, has been silent
 *     for `silentEndMs` (only ever an active scroll, one that had a cause). Its newest frame, up to `REPORT_SLACK_MS` after the
 *     page's last report, is the `04` image: where it landed. It is fixed by
 *     that report, not by when the end is noticed, so a click soon after does
 *     not show in it.
 *  4. A scroll still open when the page changes or the recording stops is not
 *     recorded.
 *
 * Both images are decided once, at the end. Who scrolled is not known here.
 * Newly confirmed frames and completion are returned as evidence. The
 * stateless scroll-clip sidecar projects that evidence into streaming writes
 * for optional video. Retained frames preserve their observed positions.
 */
export function scrollEpisodeRule({
  id = 'scroll-episode', minScrollPx = SCROLL_DEFAULTS.minScrollPx,
  silentEndMs = SCROLL_DEFAULTS.silentEndMs,
}: ScrollEpisodeOptions = {}): MilestoneRule<ScrollEpisodeState> {
  return {
    id,
    init: () => INITIAL,
    evaluate: (state, event, context): InteractionResult<ScrollEpisodeState> => {
      const result = advanceScroll(state, event, context, id, minScrollPx, silentEndMs);
      return {
        nextState: result.nextState,
        captures: result.captures,
        clipWrites: result.evidence ? scrollClipWrites(result.evidence) : [],
      };
    },
  };
}
export const ScrollEpisodeRule = scrollEpisodeRule();
