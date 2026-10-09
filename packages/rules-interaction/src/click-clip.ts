import type { ClipWrite, CompositorFrame, PagePosition } from '@openuji/core';
import type { RuleResult } from '@openuji/engine';
import type { ClickEpisodeState, OpenClick } from './click.js';
import { episodeLabel, InteractionLabel } from './episode.js';

/** A clip being made: the screen it starts from, and the click it is of, once there is one. */
type Clip = Readonly<{ start: CompositorFrame; click?: OpenClick }>;

/**
 * Which frames make each click's video, read off the click rule's state.
 *
 * Every click gets its own clip, from the screen before its press — its `10`
 * — to where its response came to rest — its `11`. The rule says which;
 * nothing here decides about clicking. It compares the state before and after
 * one event and says what changed:
 *  - a clip ended: `keep` with its click's `11` if the rule captured one and
 *    the clip ends on it, `drop` if not — a press that ended without a click,
 *    the recording stopped or moved to another tab, or a later press that
 *    made the `11` the screen before it while the clip ran on;
 *  - a clip began, once a frame came after the screen before its press: that
 *    screen starts the clip, then what came since. Frames arrive in the order
 *    they were drawn, so the `10` is final by then; where nothing changes, no
 *    clip begins;
 *  - a frame arrived while clips go on: the next frame of each.
 *
 * A click goes on in the clip its press began. Quick clicks share their
 * response, so their clips overlap and end on the same `11`.
 */
export function clickClipWrites(
  ruleId: string,
  before: ClickEpisodeState,
  after: RuleResult<ClickEpisodeState>,
  frame: CompositorFrame | null,
  position: PagePosition | null,
): ClipWrite[] {
  const was = filming(ruleId, before);
  const now = filming(ruleId, after.nextState);
  const last = before.seen.at(-1);
  const writes: ClipWrite[] = [];

  for (const [id, { click }] of was) {
    if (now.has(id)) continue;
    const post =
      click &&
      after.captures.find(
        (capture) =>
          capture.viewId === click.view.id &&
          capture.label === episodeLabel(InteractionLabel.postClick, click.episode),
      );
    writes.push(post && post.frame === last ? { type: 'keep', id, capture: post } : { type: 'drop', id });
  }

  for (const [id, { start }] of now) {
    const frames = was.has(id) ? (frame ? [frame] : []) : startingAt(start, after.nextState.seen);
    for (const each of frames) writes.push({ type: 'frame', id, frame: each, position });
  }

  return writes;
}

/**
 * The clips being made in `state`, by id: one per click with a cause, named
 * by its press — or, for a click the page's own code made, by its view and
 * number — and one for a press still down; each only once a frame came after
 * the screen before it. A click the browser made with no press reported has
 * no `10`, so no clip. Two clicks naming one press (a label passing its click
 * on) share the first one's clip.
 */
function filming(ruleId: string, state: ClickEpisodeState): Map<string, Clip> {
  const clips = new Map<string, Clip>();
  const begun = (id: string, start: CompositorFrame | null | undefined, click?: OpenClick): void => {
    if (start && state.seen.at(-1) !== start && !clips.has(id)) {
      clips.set(id, click ? { start, click } : { start });
    }
  };
  for (const click of state.open) {
    const id = click.press ? `${ruleId}-${click.press.pressId}` : `${ruleId}-v${click.view.id}-c${click.episode}`;
    begun(id, click.cause?.before, click);
  }
  if (state.press?.state === 'down') begun(`${ruleId}-${state.press.pressId}`, state.press.before);
  return clips;
}

/**
 * How a clip starts: the screen before its cause, then what came after it,
 * in the order it arrived — not by `index`, which starts over when the
 * compositor is attached again.
 */
function startingAt(start: CompositorFrame, seen: readonly CompositorFrame[]): CompositorFrame[] {
  return [start, ...seen.slice(seen.indexOf(start) + 1)];
}
