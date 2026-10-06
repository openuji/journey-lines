import {
  arrivedAtMs,
  QUIET_AFTER_MS,
  type CompositorFrame,
  type ScrollSample,
  type ViewState,
} from '@openuji/core';
import {
  captureFor,
  unchanged,
  type MilestoneRule,
  type RuleResult,
} from '@openuji/engine';
import { episodeLabel, InteractionLabel } from './episode.js';

type Offset = Readonly<{ x: number; y: number }>;

/** A scroll of the page that has not ended yet. */
export type OpenScroll = Readonly<{
  /** The latest frame at rest before the page moved: the pre-scroll image. */
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

const INITIAL: ScrollEpisodeState = { episodeCount: 0, offset: null, open: null };

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
 * Only the offset decides. A scroll opens on the first frame whose offset
 * moved from where the page was, and has ended once any event arrives
 * `QUIET_AFTER_MS` after the last motion: a frame on a page that keeps
 * painting, `quiet` on one that stopped. When the view ends first (a
 * navigation, or Stop), what is open is flushed, unsettled: no later frame of
 * this view will come.
 *
 * Both images are fixed by the offset: the latest frame at rest before it
 * moved, and the last frame that moved. When the end is noticed changes
 * nothing. Both captures are decided once, at the end, and never revised.
 *
 * Who scrolled is not known here. Every scroll of the page is `03`/`04`.
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
    settled: boolean,
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
            `travelled ${Math.round(travelledPx)}px` +
            (settled ? '' : ', cut short by the view ending'),
          scrollEpisode: { settled, path: open.path },
        }),
      ],
    };
  };

  /** Where `frame` puts the page: it may open or extend a scroll. */
  const track = (
    state: ScrollEpisodeState,
    previous: CompositorFrame | null,
    frame: CompositorFrame,
  ): ScrollEpisodeState => {
    const here = offsetOf(frame);

    // This view's first frame: where the page rests. A route's scroll reset
    // painted together with the new route is the view change, not a scroll.
    if (!state.offset || !previous) return { ...state, offset: here };

    const moved =
      Math.abs(here.x - state.offset.x) >= movementEpsilonPx ||
      Math.abs(here.y - state.offset.y) >= movementEpsilonPx;
    if (!moved) return state;

    const open = state.open;
    return {
      ...state,
      offset: here,
      open: open
        ? { ...open, lastMoving: frame, path: [...open.path, sampleOf(frame)] }
        : {
            start: previous,
            lastMoving: frame,
            path: [sampleOf(previous), sampleOf(frame)],
          },
    };
  };

  return {
    id,
    // `view-exit` already flushed whatever was open; numbering starts over.
    init: () => INITIAL,
    evaluate: (state, event, { currentView, lastFrame, currentFrame }) => {
      const open = state.open;
      let result = unchanged(state);

      if (open) {
        if (event.type === 'view-exit' || event.type === 'stop') {
          // The view ends: no later frame of it will come, so file what is open.
          result = end(state, open, currentView, false);
        } else if (arrivedAtMs(event) - open.lastMoving.receivedAtMs >= QUIET_AFTER_MS) {
          // The offset has not changed for that long, whichever event says so.
          result = end(state, open, currentView, true);
        }
      }

      // A frame may open the next scroll, in the same event.
      if (!currentFrame) return result;
      return {
        nextState: track(result.nextState, lastFrame, currentFrame),
        captures: result.captures,
      };
    },
  };
}

/** Scroll detection with the defaults. */
export const ScrollEpisodeRule = scrollEpisodeRule();
