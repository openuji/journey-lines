import { captureFor, unchanged, type MilestoneRule } from '@journey-lines/engine';
import { DocumentLabel } from './labels.js';

export type BeforeNavigationState = Readonly<{ saved: boolean }>;

/**
 * Captures the final resting visual state before navigating away — to another
 * document or another route — or ending the session.
 *
 * This is the only rule that fires against a view that is already being
 * replaced, which is why the engine synthesizes a `view-exit` event: it is
 * delivered to every rule while `currentView` still refers to the departing
 * view, so `lastFrame` is that view's last visible frame.
 */
export const BeforeNavigationRule: MilestoneRule<BeforeNavigationState> = {
  id: 'before-navigation',
  init: () => ({ saved: false }),
  evaluate: (state, event, { currentView, lastFrame }) => {
    if (state.saved || !lastFrame) {
      return unchanged(state);
    }

    if (event.type !== 'view-exit' && event.type !== 'stop') {
      return unchanged(state);
    }

    return {
      nextState: { saved: true },
      captures: [
        captureFor(currentView, {
          label: DocumentLabel.beforeNavigation,
          frame: lastFrame,
          detail:
            event.type === 'stop'
              ? 'Session ending; preserving final resting state'
              : `${event.nextEntry === 'route' ? 'Route change' : 'Departing page'}; next URL is ${event.nextUrl}`,
        }),
      ],
    };
  },
};
