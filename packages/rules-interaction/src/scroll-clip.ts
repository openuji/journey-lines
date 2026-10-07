import type { ClipWrite, CompositorFrame } from '@openuji/core';
import type { RuleResult } from '@openuji/engine';
import type { OpenScroll, ScrollEpisodeState } from './scroll.js';

/**
 * Which frames make a scroll's video, read off the scroll rule's state.
 *
 * The rule's state already holds all a clip needs: the open scroll, and the
 * frames waiting in `rest.pending` to be proven at rest. So nothing here
 * decides about scrolling; it only compares the state before and after one
 * event, and says what changed as clip writes:
 *  - the open scroll ended: `keep` with its `04` if the rule recorded it,
 *    `drop` if not (a jitter, a page change, the recording stopping);
 *  - a scroll opened, or the page moved again: every frame since the last one
 *    written, through this one. A still frame waits until the page moves
 *    after it, because only then is it inside the scroll.
 */
export function scrollClipWrites(
  ruleId: string,
  before: ScrollEpisodeState,
  after: RuleResult<ScrollEpisodeState>,
  frame: CompositorFrame | null,
): ClipWrite[] {
  const was = before.open;
  const now = after.nextState.open;
  const writes: ClipWrite[] = [];

  if (was && was.start !== now?.start) {
    const post = after.captures.find((capture) => capture.scrollEpisode);
    const id = clipOf(ruleId, was);
    writes.push(post ? { type: 'keep', id, capture: post } : { type: 'drop', id });
  }

  if (now && now.lastMoving === frame) {
    // Frames up to this index are in the clip already.
    const written = was?.start === now.start ? was.lastMoving.index : now.start.index - 1;
    // `start` is the frame proven at rest, or one that was waiting to be.
    const known = [before.rest.proven, ...before.rest.pending.map((w) => w.frame), frame];
    const id = clipOf(ruleId, now);
    for (const f of known) {
      if (f && f.index > written) writes.push({ type: 'frame', id, frame: f });
    }
  }

  return writes;
}

/** A scroll's clip is named by its start frame: `scroll-episode-412`. */
function clipOf(ruleId: string, open: OpenScroll): string {
  return `${ruleId}-${open.start.index}`;
}
