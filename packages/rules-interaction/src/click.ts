import {
  arrivedAtMs,
  QUIET_AFTER_MS,
  type CompositorFrame,
  type DomainEvent,
  type InteractionEvent,
  type PressEvent,
  type TargetElementMeta,
  type ViewState,
} from '@openuji/core';
import { captureFor, type MilestoneRule, type RuleResult } from '@openuji/engine';
import { episodeLabel, InteractionLabel } from './episode.js';
import { clickClipWrites } from './click-clip.js';
import { REPORT_SLACK_MS } from './scroll.js';

/**
 * When something happened: on Chrome's monotonic clock where that is known
 * (`happenedAtMs`), and when its report arrived.
 */
type When = Readonly<{ atMs?: number; arrivedMs: number }>;

/** What a click came from: when, and the screen then. */
type Cause = Readonly<{
  when: When;
  /** The newest frame drawn by then; null while none is known. */
  before: CompositorFrame | null;
}>;

/** A press reported by the probe, until a newer one replaces it. */
type Press = Cause &
  Readonly<{
    pressId: string;
    kind: PressEvent['kind'];
    detail?: string;
    /**
     * Still down, or became a click (part of that click's response), or
     * ended without one: the page said so (`press-ended`).
     */
    state: 'down' | 'clicked' | 'ended';
  }>;

/** A click whose response has not come to rest yet. */
export type OpenClick = Readonly<{
  episode: number;
  target: TargetElementMeta;
  /** The view it was clicked in, as it was then: its `10` is filed there. */
  view: ViewState;
  /**
   * Its press; or the click itself, when the page's own code made it; or
   * null when the browser made it for the person but no press was reported —
   * the response may have begun before the click, so there is no `10`.
   */
  cause: Cause | null;
  /** The press it came from, if one was reported. */
  press?: Readonly<{ pressId: string; kind: PressEvent['kind']; detail?: string }>;
  /** The page's own code made it (`el.click()`), not the browser for the person. */
  byPage: boolean;
  arrivedMs: number;
}>;

export type ClickEpisodeState = Readonly<{
  /** Clicks seen so far in this view. */
  episodeCount: number;
  /**
   * The frames that arrived within `REPORT_SLACK_MS` of the newest one, and
   * the newest before them, oldest first: a press's report can arrive after
   * frames drawn after it. The last one is on screen.
   */
  seen: readonly CompositorFrame[];
  press: Press | null;
  /** Clicks sharing one response that has not come to rest, oldest first. */
  open: readonly OpenClick[];
  /** When the latest press or click arrived. */
  lastCauseMs: number;
}>;

export interface ClickEpisodeOptions {
  readonly id?: string;
  /** A response whose screen is still changing this long after the last click is over too, ms. */
  readonly stillMovingMs?: number;
}

export const CLICK_DEFAULTS = {
  stillMovingMs: 2_000,
} as const;

const INITIAL: ClickEpisodeState = {
  episodeCount: 0,
  seen: [],
  press: null,
  open: [],
  lastCauseMs: -Infinity,
};

/** How a response's pictures were decided. */
type Ending = 'rested' | 'still changing' | 'stopped' | 'left for another tab';

/** Whether Chrome says when `frame` was drawn and when the cause happened: they can be compared. */
function onChromesClock(frame: CompositorFrame, when: When): boolean {
  return when.atMs !== undefined && frame.drawnAtMs !== undefined;
}

/**
 * The newest of `frames` (all arrived already) drawn by `when`. Where Chrome
 * doesn't say when, a frame is placed by arrival — the click is then "placed
 * by arrival" — and having arrived before the cause's report is what puts it
 * before: the queue's order is exact, its clock ties.
 */
function newestDrawnBy(frames: readonly CompositorFrame[], when: When): CompositorFrame | null {
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    if (frame && (!onChromesClock(frame, when) || (frame.drawnAtMs ?? 0) <= (when.atMs ?? 0))) {
      return frame;
    }
  }
  return null;
}

/**
 * `cause` once `frame` has arrived after its report: frames arrive in the
 * order drawn, so one drawn by then is newer. Placed by arrival, it is after.
 */
function later<C extends Cause>(cause: C, frame: CompositorFrame): C {
  return onChromesClock(frame, cause.when) && (frame.drawnAtMs ?? 0) <= (cause.when.atMs ?? 0)
    ? { ...cause, before: frame }
    : cause;
}

/** `seen` with `frame` on screen. */
function seenWith(seen: readonly CompositorFrame[], frame: CompositorFrame): CompositorFrame[] {
  const all = [...seen, frame];
  const young = all.filter((f) => frame.receivedAtMs - f.receivedAtMs < REPORT_SLACK_MS);
  const older = all.filter((f) => frame.receivedAtMs - f.receivedAtMs >= REPORT_SLACK_MS).at(-1);
  return older ? [older, ...young] : young;
}

const placedByArrival = (cause: Cause | null, frame: CompositorFrame | null): boolean =>
  cause !== null && (cause.when.atMs === undefined || frame?.drawnAtMs === undefined);

/** The pressed key or pointer, in words, for a key press only: `, pressed with Enter`. */
const pressedWith = (click: OpenClick): string =>
  click.press?.kind === 'key' ? `, pressed with ${click.press.detail ?? 'a key'}` : '';

/**
 * Captures, for each click, the screen before it and where its response came
 * to rest — the scroll rule's model for clicks.
 *
 *  1. A click starts from its press: the primary button going down, or Enter
 *     or Space, reported before the page responds — a page can respond on the
 *     press already, before the `click` (flatpickr turns the month on
 *     `pointerdown`). The probe names each press and the click carries the
 *     name of the one it came from, so the two are paired where the order of
 *     DOM events is exact; the page also says when a press ended without a
 *     click, and none can come from it then. A click the page's own code made
 *     is its own cause. A click the browser made for the person with no press
 *     reported has no `10`: what came before it is not known.
 *  2. Frames are placed by when they were drawn, against when the press
 *     happened, on Chrome's clock: arrival can't tell, a frame and the report
 *     of an input reach the host in either order. Where a time is missing the
 *     click is placed by arrival, and its captures say so. The `10` is the
 *     newest frame drawn by the press.
 *  3. The response has come to rest once nothing has arrived for
 *     `QUIET_AFTER_MS` since the latest click or frame: the screen stopped
 *     changing. That is what the frames show, not that the page is done — a
 *     response that comes after a still stretch is not this click's. A screen
 *     that never stops changing ends `stillMovingMs` after the last click,
 *     and says so. A click before the screen rests shares the response: each
 *     click keeps its own `10`, and they share the `11`.
 *  4. Both pictures are decided once, at rest: by then every frame drawn
 *     before the press has arrived. The `11` is the newest frame — drawn
 *     before a later press, if one came that is not part of this response.
 *     A response still open when the view changes goes on into the next one
 *     and is filed under the view it was clicked in; one still open when the
 *     recording stops or moves to another tab gets its `10`s only.
 *
 * Next to its captures the rule returns each click's frames as clip writes
 * (`click-clip.ts`), for a video if the recording makes them.
 */
export function clickEpisodeRule(options: ClickEpisodeOptions = {}): MilestoneRule<ClickEpisodeState> {
  const { id = 'click-episode', stillMovingMs = CLICK_DEFAULTS.stillMovingMs } = options;

  /** Whether the open response is over at `nowMs`, and how. */
  const over = (state: ClickEpisodeState, nowMs: number): Ending | null => {
    if (state.open.length === 0) return null;
    const lastFrameMs = state.seen.at(-1)?.receivedAtMs ?? -Infinity;
    if (nowMs - Math.max(state.lastCauseMs, lastFrameMs) >= QUIET_AFTER_MS) return 'rested';
    if (nowMs - state.lastCauseMs >= stillMovingMs) return 'still changing';
    return null;
  };

  /** Where the open response came to rest: the screen now, or before a later press that is not part of it. */
  const restingFrame = (state: ClickEpisodeState): CompositorFrame | null => {
    const lastClick = state.open.at(-1);
    const press = state.press;
    return press && press.state !== 'clicked' && lastClick && press.when.arrivedMs >= lastClick.arrivedMs
      ? press.before
      : (state.seen.at(-1) ?? null);
  };

  /** The open response is over: each click's `10`, and the shared `11` unless it never rested. */
  const end = (
    state: ClickEpisodeState,
    ending: Ending,
    view: ViewState,
  ): RuleResult<ClickEpisodeState> => {
    const after = ending === 'rested' || ending === 'still changing' ? restingFrame(state) : null;
    const shared = state.open.length;
    const captures = state.open.flatMap((click) => {
      const { target, episode, cause } = click;
      const sameView = click.view.id === view.id;
      const arrival = placedByArrival(cause, cause?.before ?? after) ? '; placed by arrival' : '';
      const before = cause?.before ?? null;
      const pre = before
        ? [
            captureFor(click.view, {
              label: episodeLabel(InteractionLabel.preClick, episode),
              frame: before,
              detail:
                `Pre-click state on <${target.selector}> "${target.textSnippet ?? ''}"${pressedWith(click)}` +
                (click.byPage ? ", clicked by the page's own code" : '') +
                arrival +
                (after ? '' : `; the recording ${ending} before the response came to rest`),
              domTarget: target,
            }),
          ]
        : [];
      const post = after
        ? [
            captureFor(sameView ? view : click.view, {
              label: episodeLabel(InteractionLabel.postClick, episode),
              frame: after,
              detail:
                (ending === 'rested'
                  ? `Where the response to clicking <${target.selector}> came to rest`
                  : `The response to clicking <${target.selector}>, still changing ${stillMovingMs / 1000} s after the last click`) +
                (shared > 1 ? `, shared by ${shared} clicks` : '') +
                (before === after ? '; nothing changed on screen' : '') +
                (cause === null ? '; no press was reported before this click, so no pre-click' : '') +
                arrival +
                (sameView ? '' : `, now showing ${view.url}`),
              domTarget: target,
            }),
          ]
        : [];
      return [...pre, ...post];
    });
    // Stopping, or leaving for another tab, ends everything going: a press
    // still down too. Coming to rest ends only the clicks.
    const leaving = ending === 'stopped' || ending === 'left for another tab';
    return { nextState: { ...state, open: [], press: leaving ? null : state.press }, captures };
  };

  const pressed = (state: ClickEpisodeState, event: PressEvent): ClickEpisodeState => {
    const when = { atMs: event.happenedAtMs, arrivedMs: event.receivedAtMs };
    return {
      ...state,
      press: {
        pressId: event.pressId,
        kind: event.kind,
        ...(event.detail ? { detail: event.detail } : {}),
        when,
        before: newestDrawnBy(state.seen, when),
        state: 'down',
      },
      lastCauseMs: event.receivedAtMs,
    };
  };

  /** The page said a press ended without a click: no click can come from it now. */
  const pressEnded = (state: ClickEpisodeState, pressId: string): ClickEpisodeState =>
    state.press?.pressId === pressId && state.press.state === 'down'
      ? { ...state, press: { ...state.press, state: 'ended' } }
      : state;

  const clicked = (
    state: ClickEpisodeState,
    event: InteractionEvent,
    view: ViewState,
  ): ClickEpisodeState => {
    const press = state.press;
    const paired =
      press !== null && press.state !== 'ended' && event.pressId !== undefined && press.pressId === event.pressId;
    const when = { atMs: event.happenedAtMs, arrivedMs: event.receivedAtMs };
    const cause: Cause | null = paired
      ? press
      : event.trusted === true
        ? null
        : { when, before: newestDrawnBy(state.seen, when) };
    const episode = state.episodeCount + 1;
    return {
      ...state,
      episodeCount: episode,
      press: paired ? { ...press, state: 'clicked' } : press,
      open: [
        ...state.open,
        {
          episode,
          target: event.target,
          view,
          cause,
          ...(paired
            ? { press: { pressId: press.pressId, kind: press.kind, ...(press.detail ? { detail: press.detail } : {}) } }
            : {}),
          byPage: event.trusted === false,
          arrivedMs: event.receivedAtMs,
        },
      ],
      lastCauseMs: event.receivedAtMs,
    };
  };

  /** A frame arrived: on screen, and a picture of the screen before a cause it was drawn by. */
  const seen = (state: ClickEpisodeState, frame: CompositorFrame): ClickEpisodeState => ({
    ...state,
    seen: seenWith(state.seen, frame),
    press: state.press && later(state.press, frame),
    open: state.open.map((click) => (click.cause ? { ...click, cause: later(click.cause, frame) } : click)),
  });

  const follow = (
    state: ClickEpisodeState,
    event: DomainEvent,
    view: ViewState,
    frame: CompositorFrame | null,
  ): RuleResult<ClickEpisodeState> => {
    if (event.type === 'stop') return end(state, 'stopped', view);

    // Over before this event counts: a frame after the screen has rested is not the response.
    const ending = over(state, arrivedAtMs(event));
    const leaving = event.type === 'view-exit' && event.nextEntry === 'tab';
    const result: RuleResult<ClickEpisodeState> =
      ending || leaving
        ? end(state, ending ?? 'left for another tab', view)
        : { nextState: state, captures: [] };

    let next = result.nextState;
    if (frame) next = seen(next, frame);
    if (event.type === 'press') next = pressed(next, event);
    if (event.type === 'press-ended') next = pressEnded(next, event.pressId);
    if (event.type === 'interaction' && event.action === 'click') next = clicked(next, event, view);
    return { nextState: next, captures: result.captures };
  };

  return {
    id,
    // Numbering starts over with every view; a response still open goes on
    // into it, unless the view is another tab's.
    init: (view, previous) =>
      !previous || view.entry === 'tab' ? INITIAL : { ...previous, episodeCount: 0 },
    evaluate: (state, event, { currentView, currentFrame }) => {
      const result = follow(state, event, currentView, currentFrame);
      return {
        ...result,
        clipWrites: clickClipWrites(id, state, result, currentFrame, currentView.position),
      };
    },
  };
}

/** Click detection with the defaults. */
export const ClickEpisodeRule = clickEpisodeRule();
