import {
  arrivedAtMs,
  QUIET_AFTER_MS,
  type CompositorFrame,
  type DomainEvent,
  type PagePosition,
  type PageScrollEvent,
  type ScrollSample,
  type ViewState,
} from '@openuji/core';
import {
  captureFor,
  type MilestoneRule,
  type RuleContext,
  type RuleResult,
} from '@openuji/engine';
import { episodeLabel, InteractionLabel } from './episode.js';
import { scrollClipWrites } from './scroll-clip.js';

/**
 * How far apart a picture and the page's report about it can arrive, either
 * way round, ms. Measured on Chrome 154: headed, the report came first by
 * 17–50 ms; in headless-shell the picture came first by 6–8 ms; on a busy
 * page a picture changed 67 ms before the report (its scrollbar only).
 */
export const REPORT_SLACK_MS = 100;

/** A scroll of the page that has not ended yet. */
export type OpenScroll = Readonly<{
  /** The page at rest: the newest frame `REPORT_SLACK_MS` before its first report, the `03`. */
  start: CompositorFrame;
  /** Where the page was before, if it had said in this view. */
  from: PagePosition | null;
  /** Every position the page reported since, in order. */
  path: readonly ScrollSample[];
  /** When the page last reported a position. */
  lastReportMs: number;
  /** When it said `scrollend` after that; null while it still moves. */
  endedMs: number | null;
  /** The newest frame of the scroll: where it landed, once it is over. The `04`. */
  last: CompositorFrame;
  /** Frames after it landed: in the scroll only if the page moves again. */
  after: readonly CompositorFrame[];
}>;

export type ScrollEpisodeState = Readonly<{
  /** Scrolls kept so far in this view. */
  episodeCount: number;
  /** When this view's first event arrived; its first `QUIET_AFTER_MS` are the page arriving. */
  beganMs: number | null;
  /** The newest frame of this view older than `REPORT_SLACK_MS`: a scroll starts from it. */
  rest: CompositorFrame | null;
  /** This view's frames since, oldest first. */
  recent: readonly CompositorFrame[];
  open: OpenScroll | null;
}>;

export interface ScrollEpisodeOptions {
  readonly id?: string;
  /** A scroll is kept only if the page travelled at least this far, px. */
  readonly minScrollPx?: number;
  /** A scroll whose page has been silent this long, with no `scrollend`, is over too, ms. */
  readonly silentEndMs?: number;
}

export const SCROLL_DEFAULTS = {
  minScrollPx: 8,
  silentEndMs: 1_000,
} as const;

const INITIAL: ScrollEpisodeState = { episodeCount: 0, beganMs: null, rest: null, recent: [], open: null };

/**
 * Where `frame` belongs in `open`: in the scroll, up to `REPORT_SLACK_MS`
 * after the page's last report (or as the first picture since it began, if
 * the page paints late), or after it. The rule and its clip both ask this, so
 * they cannot disagree.
 */
export function placeFrame(open: OpenScroll, frame: CompositorFrame): 'scroll' | 'after' {
  return open.last === open.start || frame.receivedAtMs - open.lastReportMs <= REPORT_SLACK_MS
    ? 'scroll'
    : 'after';
}

/** The frames on screen at `atMs`: the one a scroll would start from, and those after it. */
export function startAt(
  state: ScrollEpisodeState,
  atMs: number,
): { start: CompositorFrame | null; lead: readonly CompositorFrame[] } {
  const older = state.recent.filter((f) => atMs - f.receivedAtMs >= REPORT_SLACK_MS);
  return {
    start: older.at(-1) ?? state.rest,
    lead: state.recent.filter((f) => atMs - f.receivedAtMs < REPORT_SLACK_MS),
  };
}

const distance = (a: PagePosition, b: PagePosition): number => Math.hypot(b.x - a.x, b.y - a.y);

/** How far the page travelled, from where it was through every report. Down and back counts twice. */
function travelOf({ from, path }: OpenScroll): number {
  const points = from ? [from, ...path] : path;
  let px = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) px += distance(a, b);
  }
  return px;
}

const where = ({ x, y }: PagePosition): string => `(${Math.round(x)}, ${Math.round(y)})`;

/** `state` with `frame` on screen: recent while young, then the rest; and in the open scroll. */
function seen(state: ScrollEpisodeState, frame: CompositorFrame): ScrollEpisodeState {
  const { start, lead } = startAt({ ...state, recent: [...state.recent, frame] }, frame.receivedAtMs);
  const open = state.open;
  return {
    ...state,
    rest: start,
    recent: lead,
    open:
      open &&
      (placeFrame(open, frame) === 'scroll'
        ? { ...open, last: frame }
        : { ...open, after: [...open.after, frame] }),
  };
}

/**
 * Captures the frame before and the frame after each scroll of the page.
 *
 * The page says when: it reports its position at every `scroll` and says
 * `scrollend` when Chrome considers the scroll complete. Frames say what was
 * seen. The offset stamped on a frame cannot say when: on a real page it
 * stops changing for up to 660 ms while the page scrolls (Chrome 154).
 *
 *  1. A scroll starts at the page's first report, from the page at rest: the
 *     newest frame `REPORT_SLACK_MS` before it, the `03` image (`startAt`).
 *     Reports in a view's first `QUIET_AFTER_MS` are the page arriving, not a
 *     scroll: a router putting the new route at the top, a restored scroll
 *     position. The frame on screen then may still be the previous page's.
 *  2. Every later report extends it, and a report after `scrollend` takes it
 *     up again: a notch spin, or a gesture that moves again, is one scroll.
 *  3. It is over once the page has said `scrollend` and then reported nothing
 *     for `QUIET_AFTER_MS`, or, should `scrollend` never come, has been silent
 *     for `silentEndMs`. Its newest frame, up to `REPORT_SLACK_MS` after the
 *     page's last report, is the `04` image: where it landed. It is fixed by
 *     that report, not by when the end is noticed, so a click soon after does
 *     not show in it.
 *  4. A scroll still open when the page changes or the recording stops is not
 *     recorded.
 *
 * Both images are decided once, at the end. Who scrolled is not known here.
 * Next to its captures the rule returns the scroll's frames as clip writes
 * (`scroll-clip.ts`), for a video if the recording makes them.
 */
export function scrollEpisodeRule(
  options: ScrollEpisodeOptions = {},
): MilestoneRule<ScrollEpisodeState> {
  const {
    id = 'scroll-episode',
    minScrollPx = SCROLL_DEFAULTS.minScrollPx,
    silentEndMs = SCROLL_DEFAULTS.silentEndMs,
  } = options;

  /** The page reported where it is: a scroll starts, goes on, or says it is complete. */
  const report = (
    state: ScrollEpisodeState,
    event: PageScrollEvent,
    from: PagePosition | null,
  ): ScrollEpisodeState => {
    const sample = {
      receivedAtMs: event.receivedAtMs,
      pageTimeMs: event.pageTimeMs,
      x: event.x,
      y: event.y,
    };
    const endedMs = event.ended ? event.receivedAtMs : null;

    const open = state.open;
    if (open) {
      // It moves again (or says it ended): what came after it seemed to have
      // landed was in the scroll after all.
      return {
        ...state,
        open: {
          ...open,
          path: [...open.path, sample],
          lastReportMs: sample.receivedAtMs,
          endedMs,
          last: open.after.at(-1) ?? open.last,
          after: [],
        },
      };
    }

    // The page arriving, or no picture of this view at rest: not a scroll.
    const arriving = state.beganMs === null || event.receivedAtMs - state.beganMs < QUIET_AFTER_MS;
    const { start, lead } = startAt(state, event.receivedAtMs);
    if (arriving || !start) return state;
    return {
      ...state,
      open: {
        start,
        from,
        path: [sample],
        lastReportMs: sample.receivedAtMs,
        endedMs,
        last: lead.at(-1) ?? start,
        after: [],
      },
    };
  };

  /** The page has stayed put, and a picture since it began shows where it landed. */
  const isOver = (open: OpenScroll, atMs: number): boolean =>
    open.last !== open.start &&
    (open.endedMs !== null
      ? atMs - open.endedMs >= QUIET_AFTER_MS
      : atMs - open.lastReportMs >= silentEndMs);

  /** `open` is over: a kept pair, or nothing if the page barely moved. */
  const end = (
    state: ScrollEpisodeState,
    open: OpenScroll,
    view: ViewState,
  ): RuleResult<ScrollEpisodeState> => {
    const travelledPx = travelOf(open);
    const to = open.path.at(-1);
    if (travelledPx < minScrollPx || !to) {
      return { nextState: { ...state, open: null }, captures: [] };
    }

    const episode = state.episodeCount + 1;
    const from = open.from;
    return {
      nextState: { ...state, episodeCount: episode, open: null },
      captures: [
        captureFor(view, {
          label: episodeLabel(InteractionLabel.preScroll, episode),
          frame: open.start,
          detail: `Pre-scroll #${episode} of the page${from ? ` at ${where(from)}` : ''}`,
          // Where the page was before it moved, not where it is now; unknown
          // if it never said.
          position: from ?? undefined,
        }),
        captureFor(view, {
          label: episodeLabel(InteractionLabel.postScroll, episode),
          frame: open.last,
          detail:
            `Post-scroll #${episode} of the page: ${from ? `${where(from)} → ` : 'to '}${where(to)}, ` +
            `travelled ${Math.round(travelledPx)}px`,
          scrollEpisode: { path: open.path },
        }),
      ],
    };
  };

  /** What `event` does to the scroll: the rule itself. */
  const follow = (
    state: ScrollEpisodeState,
    event: DomainEvent,
    { currentView, currentFrame }: RuleContext,
  ): RuleResult<ScrollEpisodeState> => {
    // The page changes, or the recording stops, before the scroll is over:
    // its last frame may already be the next page's. Not recorded.
    if (event.type === 'view-exit' || event.type === 'stop') {
      return { nextState: { ...state, open: null }, captures: [] };
    }

    let next = state.beganMs === null ? { ...state, beganMs: arrivedAtMs(event) } : state;
    if (currentFrame) next = seen(next, currentFrame);
    if (event.type === 'page-scroll') next = report(next, event, currentView.position);

    const open = next.open;
    if (open && isOver(open, arrivedAtMs(event))) return end(next, open, currentView);
    return { nextState: next, captures: [] };
  };

  return {
    id,
    // `view-exit` already ended whatever was open; numbering starts over.
    init: () => INITIAL,
    evaluate: (state, event, ctx) => {
      const result = follow(state, event, ctx);
      return {
        ...result,
        clipWrites: scrollClipWrites(id, state, result, ctx.currentFrame, ctx.currentView.position),
      };
    },
  };
}

/** Scroll detection with the defaults. */
export const ScrollEpisodeRule = scrollEpisodeRule();
