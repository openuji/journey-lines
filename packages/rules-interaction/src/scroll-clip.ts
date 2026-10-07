import type { ClipWrite, CompositorFrame, PagePosition } from '@openuji/core';
import type { RuleResult } from '@openuji/engine';
import { placeFrame, type OpenScroll, type ScrollEpisodeState } from './scroll.js';

/**
 * Which frames make a scroll's video, read off the scroll rule's state.
 *
 * The page's reports say when a scroll is going on; `placeFrame` says where a
 * frame belongs. Nothing here decides about scrolling; it compares the state
 * before and after one event and says what changed:
 *  - a scroll opened: its `03` frame starts the clip, then the frames already
 *    on screen since (a picture can come before the report about it);
 *  - a frame arrived in the scroll: the next frame, up to its `04`; one after
 *    it landed waits, as the rule holds it;
 *  - the page moved again: the frames that waited were in the scroll;
 *  - it ended: `keep` with its `04` if the rule recorded it, `drop` if not.
 *
 * Each frame carries where the page last said it was when the frame arrived:
 * the trace's position.
 */
export function scrollClipWrites(
  ruleId: string,
  before: ScrollEpisodeState,
  after: RuleResult<ScrollEpisodeState>,
  frame: CompositorFrame | null,
  position: PagePosition | null,
): ClipWrite[] {
  const was = before.open;
  const now = after.nextState.open;
  const same = was !== null && now !== null && was.start === now.start;
  const writes: ClipWrite[] = [];

  if (now && !same) {
    const id = clipOf(ruleId, now);
    writes.push({ type: 'frame', id, frame: now.start, position: now.from });
    for (const early of before.recent.filter((f) => f.index > now.start.index)) {
      writes.push({ type: 'frame', id, frame: early, position: now.from });
    }
  }

  if (was && frame && placeFrame(was, frame) === 'scroll') {
    writes.push({ type: 'frame', id: clipOf(ruleId, was), frame, position });
  }

  // The page moved again: the frames after it seemed to land were in the scroll.
  if (same && was.after.length > 0 && now.after.length === 0) {
    for (const waited of was.after) {
      writes.push({ type: 'frame', id: clipOf(ruleId, was), frame: waited, position });
    }
  }

  if (was && !same) {
    const post = after.captures.find((capture) => capture.scrollEpisode);
    const id = clipOf(ruleId, was);
    writes.push(post ? { type: 'keep', id, capture: post } : { type: 'drop', id });
  }

  return writes;
}

/** A scroll's clip is named by its start frame: `scroll-episode-412`. */
function clipOf(ruleId: string, open: OpenScroll): string {
  return `${ruleId}-${open.start.index}`;
}
