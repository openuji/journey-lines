import type { CompositorFrame, DocumentProgress } from '@openuji/core';
import { captureFor, unchanged, type MilestoneRule } from '@openuji/engine';
import { DocumentLabel } from './labels.js';

export type LifecycleMilestoneState = Readonly<{
  /** The document this state belongs to. */
  loaderId: string;
  /** A matching lifecycle notification arrived; capture what shows next. */
  armed: boolean;
  /** Already captured once for this document. */
  fired: boolean;
}>;

export interface LifecycleMilestoneOptions {
  /** Unique rule id. */
  readonly id: string;
  /** How far the document must have come to arm. */
  readonly milestone: DocumentProgress;
  /** Capture label, which also orders the output filenames. */
  readonly label: string;
}

/**
 * Builds a one-shot "arm on a milestone, capture what shows" rule.
 *
 * A milestone tells us how far the document has come, but not what the user
 * can see — the pixels for it land on a later frame. So the rule arms on it
 * and captures the first frame after it. A page that paints nothing more
 * after it sends no such frame: once the stream goes `quiet`, the frame
 * showing is the page at the milestone, and that is captured instead.
 *
 * One rule per milestone: enabling or disabling a milestone is an entry in the
 * rule array rather than another pair of flags inside a shared rule.
 *
 * Milestones belong to documents, not views, so the one-shot is per document:
 * across a route change the state carries over, and a milestone that armed
 * just before it is captured in the new view.
 */
export function lifecycleMilestoneRule({
  id,
  milestone,
  label,
}: LifecycleMilestoneOptions): MilestoneRule<LifecycleMilestoneState> {
  return {
    id,
    init: (view, previous) =>
      previous?.loaderId === view.loaderId
        ? previous
        : { loaderId: view.loaderId, armed: false, fired: false },
    evaluate: (state, event, { currentView, lastFrame, currentFrame }) => {
      if (event.type === 'milestone') {
        if (
          event.name !== milestone ||
          event.loaderId !== currentView.loaderId ||
          state.fired
        ) {
          return unchanged(state);
        }
        return { nextState: { ...state, armed: true }, captures: [] };
      }

      if (!state.armed || state.fired) return unchanged(state);

      const fire = (frame: CompositorFrame, detail: string) => ({
        nextState: { ...state, armed: false, fired: true },
        captures: [captureFor(currentView, { label, frame, detail })],
      });

      if (event.type === 'frame' && currentFrame) {
        return fire(currentFrame, `Compositor frame once the document is ${milestone}`);
      }
      if (event.type === 'quiet' && lastFrame) {
        return fire(lastFrame, `Compositor frame showing once the document is ${milestone}; nothing was painted after it`);
      }

      return unchanged(state);
    },
  };
}

/** What shows once the document's content is in place. */
export const ReadyRule = lifecycleMilestoneRule({
  id: 'document-ready',
  milestone: 'ready',
  label: DocumentLabel.domContentLoaded,
});

/** What shows once the document has settled — the "settled" view. */
export const SettledRule = lifecycleMilestoneRule({
  id: 'document-settled',
  milestone: 'settled',
  label: DocumentLabel.settled,
});
