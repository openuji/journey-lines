import {
  arrivedAtMs,
  type CompositorFrame,
  type DomainEvent,
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
import { elapse, hold, isProven, NOTHING_PROVEN, restart, type Rest } from './rest.js';
import { scrollClipWrites } from './scroll-clip.js';

type Offset = Readonly<{ x: number; y: number }>;

/** A scroll of the page that has not ended yet. */
export type OpenScroll = Readonly<{
  /** The page proven at rest before it moved: the pre-scroll image. */
  start: CompositorFrame;
  /** The last frame that moved: where the offset landed, so far the post-scroll image. */
  lastMoving: CompositorFrame;
  path: readonly ScrollSample[];
}>;

export type ScrollEpisodeState = Readonly<{
  /** Scrolls kept so far in this view. */
  episodeCount: number;
  /**
   * Where the page is: where it rests, or where it last moved to. Motion is
   * measured from here, not from the previous frame, so a slow drift adds up.
   * Null until this view's first frame.
   */
  offset: Offset | null;
  /** Which frame shows the page at rest. */
  rest: Rest;
  open: OpenScroll | null;
}>;

export interface ScrollEpisodeOptions {
  readonly id?: string;
  /** A scroll is kept only if the page travelled at least this far, px. */
  readonly minScrollPx?: number;
  /** A change of at least this much on either axis is motion, px. */
  readonly movementEpsilonPx?: number;
}

export const SCROLL_DEFAULTS = {
  minScrollPx: 8,
  movementEpsilonPx: 1,
} as const;

const INITIAL: ScrollEpisodeState = {
  episodeCount: 0,
  offset: null,
  rest: NOTHING_PROVEN,
  open: null,
};

const offsetOf = (frame: CompositorFrame): Offset => ({
  x: frame.scrollX,
  y: frame.scrollY,
});

const sampleOf = (frame: CompositorFrame): ScrollSample => ({
  frameIndex: frame.index,
  receivedAtMs: frame.receivedAtMs,
  x: frame.scrollX,
  y: frame.scrollY,
});

const distance = (a: Offset, b: Offset): number => Math.hypot(b.x - a.x, b.y - a.y);

/** How far the page travelled along `path`, px. Down and back up counts twice. */
function lengthOf(path: readonly ScrollSample[]): number {
  let px = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a && b) px += distance(a, b);
  }
  return px;
}

const where = ({ x, y }: Offset): string => `(${Math.round(x)}, ${Math.round(y)})`;

/**
 * Captures the frame before and the frame after each scroll of the page, from
 * compositor frames alone: each frame's metadata carries the page's offset.
 *
 * Only the offset decides, and only within one page:
 *  1. A scroll starts from a frame of this page proven at rest (see `Rest`),
 *     the `03` image. Before one is proven, in a page's first moments, what
 *     moves is the page arriving: possibly the previous page's last frame,
 *     delivered after the switch.
 *  2. When a new page reports `firstPaint`, tracking starts over from the
 *     frame on screen: frames before it may still be the previous page's.
 *  3. A scroll is recorded once the frame it landed on, the `04` image, is
 *     proven at rest. One still open when the page changes or the recording
 *     stops is not: its last frame may already be the next page's.
 *
 * Both images are decided once, at the end, and never revised. Who scrolled
 * is not known here. Every scroll of the page is `03`/`04`.
 *
 * Next to its captures the rule returns the scroll's frames as clip writes
 * (`scroll-clip.ts`), for a video if the recording makes them.
 */
export function scrollEpisodeRule(
  options: ScrollEpisodeOptions = {},
): MilestoneRule<ScrollEpisodeState> {
  const {
    id = 'scroll-episode',
    minScrollPx = SCROLL_DEFAULTS.minScrollPx,
    movementEpsilonPx = SCROLL_DEFAULTS.movementEpsilonPx,
  } = options;

  /** `open` is over: a kept pair, or nothing if the page barely moved. */
  const end = (
    state: ScrollEpisodeState,
    open: OpenScroll,
    view: ViewState,
  ): RuleResult<ScrollEpisodeState> => {
    const travelledPx = lengthOf(open.path);
    if (travelledPx < minScrollPx) {
      return { nextState: { ...state, open: null }, captures: [] };
    }

    const episode = state.episodeCount + 1;
    const from = offsetOf(open.start);
    const to = offsetOf(open.lastMoving);

    return {
      nextState: { ...state, episodeCount: episode, open: null },
      captures: [
        captureFor(view, {
          label: episodeLabel(InteractionLabel.preScroll, episode),
          frame: open.start,
          detail: `Pre-scroll #${episode} of the page at ${where(from)}`,
        }),
        captureFor(view, {
          label: episodeLabel(InteractionLabel.postScroll, episode),
          frame: open.lastMoving,
          detail:
            `Post-scroll #${episode} of the page: ${where(from)} → ${where(to)}, ` +
            `travelled ${Math.round(travelledPx)}px`,
          scrollEpisode: { path: open.path },
        }),
      ],
    };
  };

  /** Where `frame` puts the page: it may open or extend a scroll. */
  const track = (state: ScrollEpisodeState, frame: CompositorFrame): ScrollEpisodeState => {
    const here = offsetOf(frame);

    // This view's first frame: where the page rests, once proven.
    if (!state.offset) return { ...state, offset: here, rest: hold(state.rest, frame) };

    const moved =
      Math.abs(here.x - state.offset.x) >= movementEpsilonPx ||
      Math.abs(here.y - state.offset.y) >= movementEpsilonPx;
    if (!moved) return { ...state, rest: hold(state.rest, frame) };

    const next = { ...state, offset: here, rest: restart(state.rest, frame) };
    const open = state.open;
    if (open) {
      return {
        ...next,
        open: { ...open, lastMoving: frame, path: [...open.path, sampleOf(frame)] },
      };
    }

    // A scroll starts from a frame of this page proven at rest. Before one is,
    // what moves is the page arriving.
    const start = state.rest.proven;
    if (!start) return next;
    return {
      ...next,
      open: { start, lastMoving: frame, path: [sampleOf(start), sampleOf(frame)] },
    };
  };

  /** What `event` does to the scroll: today's whole rule. */
  const follow = (
    state: ScrollEpisodeState,
    event: DomainEvent,
    { currentView, lastFrame, currentFrame }: RuleContext,
  ): RuleResult<ScrollEpisodeState> => {
    // The page changes, or the recording stops, before the scroll has
    // settled: its last frame may already be the next page's. Not recorded.
    if (event.type === 'view-exit' || event.type === 'stop') {
      return { nextState: { ...state, open: null }, captures: [] };
    }

    // A new page says it has drawn. Frames before this may still be the
    // previous page's, arriving late: start over from the one on screen.
    if (isFirstPaintOf(currentView, event)) {
      return { nextState: startOver(state, lastFrame, event.receivedAtMs), captures: [] };
    }

    // Time has passed, whatever the event.
    const elapsed = { ...state, rest: elapse(state.rest, arrivedAtMs(event)) };

    // The page has stayed where the scroll landed: it is over.
    const result =
      elapsed.open && isProven(elapsed.rest, elapsed.open.lastMoving)
        ? end(elapsed, elapsed.open, currentView)
        : { nextState: elapsed, captures: [] };

    // A frame may open the next scroll, in the same event.
    if (!currentFrame) return result;
    return {
      nextState: track(result.nextState, currentFrame),
      captures: result.captures,
    };
  };

  return {
    id,
    // `view-exit` already ended whatever was open; numbering starts over.
    init: () => INITIAL,
    evaluate: (state, event, ctx) => {
      const result = follow(state, event, ctx);
      return { ...result, clipWrites: scrollClipWrites(id, state, result, ctx.currentFrame) };
    },
  };
}

/** The page's own document, in its main frame, saying it has drawn its first picture. */
function isFirstPaintOf(view: ViewState, event: DomainEvent): event is Extract<DomainEvent, { type: 'milestone' }> {
  return (
    event.type === 'milestone' &&
    event.name === 'firstPaint' &&
    event.isMainFrame &&
    event.loaderId === view.loaderId
  );
}

/**
 * Start over from `frame`, the frame on screen at `atMs`. Nothing before it
 * counts, and its stillness counts from `atMs`: it may be the previous page's
 * late frame, and only a new page's frame can come within `QUIET_AFTER_MS`.
 */
function startOver(
  state: ScrollEpisodeState,
  frame: CompositorFrame | null,
  atMs: number,
): ScrollEpisodeState {
  return {
    ...state,
    offset: frame ? offsetOf(frame) : null,
    rest: frame ? hold(NOTHING_PROVEN, frame, atMs) : NOTHING_PROVEN,
    open: null,
  };
}

/** Scroll detection with the defaults. */
export const ScrollEpisodeRule = scrollEpisodeRule();
