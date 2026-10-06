import type { MilestoneCapture } from '@openuji/core';
import type { RecorderStatus, WorkerMessage } from './protocol';

/** What the panel shows: the worker's state, mirrored from its messages. */
export type PanelState = Readonly<{
  /** False until the worker's first snapshot arrives. */
  connected: boolean;
  status: RecorderStatus;
  captures: readonly MilestoneCapture[];
  error: string | null;
}>;

export type PanelAction = WorkerMessage | Readonly<{ type: 'dismiss-error' }>;

export const initialPanelState: PanelState = {
  connected: false,
  status: { state: 'idle' },
  captures: [],
  error: null,
};

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'snapshot':
      return { connected: true, status: action.status, captures: action.captures, error: null };
    case 'capture':
      return { ...state, captures: [...state.captures, action.capture] };
    case 'status':
      return { ...state, status: action.status };
    case 'error':
      return { ...state, error: action.message };
    case 'dismiss-error':
      return { ...state, error: null };
  }
}
