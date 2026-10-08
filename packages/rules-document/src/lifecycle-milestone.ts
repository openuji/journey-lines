import type { CompositorFrame } from '@openuji/core';
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
  /** CDP `Page.lifecycleEvent` name to arm on, e.g. `'DOMContentLoaded'`. */
  readonly milestone: string;
  /** Capture label, which also orders the output filenames. */
  readonly label: string;
}

/**
 * Builds a one-shot "arm on a lifecycle notification, capture what shows"
 * rule.
 *
 * A lifecycle notification tells us the milestone was reached, but not what the
 * user can see — the pixels for it land on a later frame. So the rule arms on
 * the notification and captures the first frame after it. A page that paints
 * nothing more after it sends no such frame: once the stream goes `quiet`, the
 * frame showing is the page at the milestone, and that is captured instead.
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
        return fire(currentFrame, `Compositor frame following ${milestone}`);
      }
      if (event.type === 'quiet' && lastFrame) {
        return fire(lastFrame, `Compositor frame showing at ${milestone}; nothing was painted after it`);
      }

      return unchanged(state);
    },
  };
}

/** What shows once the DOM is ready. */
export const DomContentLoadedRule = lifecycleMilestoneRule({
  id: 'lifecycle-domcontentloaded',
  milestone: 'DOMContentLoaded',
  label: DocumentLabel.domContentLoaded,
});

/** What shows once the network has gone quiet — the "settled" view. */
export const NetworkAlmostIdleRule = lifecycleMilestoneRule({
  id: 'lifecycle-network-almost-idle',
  milestone: 'networkAlmostIdle',
  label: DocumentLabel.settled,
});

/**
 * What shows after the `load` event. Not enabled by default —
 * `networkAlmostIdle` proved the better settle signal. Note it shares the `02-`
 * label prefix with {@link NetworkAlmostIdleRule}; pass a custom `label` to
 * {@link lifecycleMilestoneRule} if you want both at once.
 */
export const LoadRule = lifecycleMilestoneRule({
  id: 'lifecycle-load',
  milestone: 'load',
  label: DocumentLabel.load,
});
