import { describe, expect, it } from 'vitest';
import type { MilestoneCapture } from '@openuji/core';
import { initialPanelState, panelReducer, type PanelAction } from '../src/lib/panel-state';
import type { RecorderStatus } from '../src/lib/protocol';

const recording: RecorderStatus = {
  state: 'recording',
  tab: { id: 7, title: 'Example', url: 'https://example.com/' },
  startedAtMs: 1_000,
};

const capture = (label: string) => ({ label }) as MilestoneCapture;

const play = (...actions: PanelAction[]) => actions.reduce(panelReducer, initialPanelState);

describe('panelReducer', () => {
  it('shows nothing until the worker’s snapshot arrives', () => {
    expect(initialPanelState.connected).toBe(false);
    expect(play({ type: 'snapshot', status: { state: 'idle' }, captures: [] }).connected).toBe(true);
  });

  it('takes the snapshot as is, then appends captures as they come', () => {
    const state = play(
      { type: 'snapshot', status: recording, captures: [capture('00-first')] },
      { type: 'capture', capture: capture('10-pre-click-01') },
      { type: 'status', status: { ...recording, state: 'stopping' } },
    );

    expect(state.captures.map((c) => c.label)).toEqual(['00-first', '10-pre-click-01']);
    expect(state.status.state).toBe('stopping');
  });

  it('a new snapshot replaces the old journey and clears a shown error', () => {
    const state = play(
      { type: 'snapshot', status: recording, captures: [capture('00-first')] },
      { type: 'error', message: 'Chrome refused' },
      { type: 'snapshot', status: { state: 'idle' }, captures: [] },
    );

    expect(state).toEqual({ connected: true, status: { state: 'idle' }, captures: [], error: null });
  });

  it('keeps an error until dismissed', () => {
    const shown = play({ type: 'error', message: 'Chrome refused' });
    expect(shown.error).toBe('Chrome refused');
    expect(panelReducer(shown, { type: 'dismiss-error' }).error).toBeNull();
  });
});
