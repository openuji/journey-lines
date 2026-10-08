import { describe, expect, it } from 'vitest';
import type { Clip, MilestoneCapture } from '@openuji/core';
import { initialPanelState, panelReducer, type PanelAction } from '../src/lib/panel-state';
import type { RecorderStatus } from '../src/lib/protocol';

const tab = { id: 7, windowId: 1, title: 'Example', url: 'https://example.com/' };
const recording: RecorderStatus = {
  state: 'recording',
  tab,
  active: { tab, state: 'recording' },
  startedAtMs: 1_000,
};

const capture = (label: string) => ({ label }) as MilestoneCapture;
const clip = (label: string) => ({ viewId: 1, label }) as Clip;

const play = (...actions: PanelAction[]) => actions.reduce(panelReducer, initialPanelState);

describe('panelReducer', () => {
  it('shows nothing until the worker’s snapshot arrives', () => {
    expect(initialPanelState.connected).toBe(false);
    expect(play({ type: 'snapshot', status: { state: 'idle' }, captures: [], clips: [] }).connected).toBe(true);
  });

  it('takes the snapshot as is, then appends captures as they come', () => {
    const state = play(
      { type: 'snapshot', status: recording, captures: [capture('00-first')], clips: [] },
      { type: 'capture', capture: capture('10-pre-click-01') },
      { type: 'status', status: { ...recording, state: 'stopping' } },
    );

    expect(state.captures.map((c) => c.label)).toEqual(['00-first', '10-pre-click-01']);
    expect(state.status.state).toBe('stopping');
  });

  it('a new snapshot replaces the old journey and clears a shown error', () => {
    const state = play(
      { type: 'snapshot', status: recording, captures: [capture('00-first')], clips: [clip('04-post-scroll-01')] },
      { type: 'error', message: 'Chrome refused' },
      { type: 'snapshot', status: { state: 'idle' }, captures: [], clips: [] },
    );

    expect(state).toEqual({ connected: true, status: { state: 'idle' }, captures: [], clips: [], error: null });
  });

  it('adds videos as they come, next to the captures', () => {
    const state = play(
      { type: 'snapshot', status: recording, captures: [capture('04-post-scroll-01')], clips: [] },
      { type: 'clip', clip: clip('04-post-scroll-01') },
    );

    expect(state.clips.map((c) => c.label)).toEqual(['04-post-scroll-01']);
    expect(state.captures).toHaveLength(1);
  });

  it('keeps an error until dismissed', () => {
    const shown = play({ type: 'error', message: 'Chrome refused' });
    expect(shown.error).toBe('Chrome refused');
    expect(panelReducer(shown, { type: 'dismiss-error' }).error).toBeNull();
  });
});
