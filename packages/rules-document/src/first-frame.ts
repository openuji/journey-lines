import { captureFor, unchanged, type MilestoneRule } from '@journey-lines/engine';
import { DocumentLabel } from './labels.js';

export type FirstFrameState = Readonly<{ saved: boolean }>;

/** Captures the very first visual frame of a new view. */
export const FirstFrameRule: MilestoneRule<FirstFrameState> = {
  id: 'first-frame',
  init: () => ({ saved: false }),
  evaluate: (state, event, { currentView, currentFrame }) => {
    if (state.saved || event.type !== 'frame' || !currentFrame) {
      return unchanged(state);
    }

    return {
      nextState: { saved: true },
      captures: [
        captureFor(currentView, {
          label: DocumentLabel.first,
          frame: currentFrame,
          detail:
            currentView.entry === 'route'
              ? `First compositor frame after the route change to ${currentView.url}`
              : 'First visual compositor frame for this document',
        }),
      ],
    };
  },
};
