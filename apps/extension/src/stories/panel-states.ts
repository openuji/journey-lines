import type { MilestoneCapture } from '@openuji/core';
import type { PanelState } from '../lib/panel-state';
import type { RecorderStatus } from '../lib/protocol';
import {
  longStoryCaptures,
  STORY_STARTED_AT_MS,
  storyCaptures,
  storyTab,
} from './fixtures';

const LIVE_STARTED_AT_MS = Date.now() - 84_000;

function retimeForLiveStory(captures: readonly MilestoneCapture[]): readonly MilestoneCapture[] {
  return captures.map((capture) => ({
    ...capture,
    frame: {
      ...capture.frame,
      receivedAtMs:
        LIVE_STARTED_AT_MS + (capture.frame.receivedAtMs - STORY_STARTED_AT_MS),
    },
  }));
}

export const liveStoryCaptures = retimeForLiveStory(storyCaptures);
export const liveLongStoryCaptures = retimeForLiveStory(longStoryCaptures);

export const idlePanelState: PanelState = {
  connected: true,
  status: { state: 'idle' },
  captures: [],
  error: null,
};

export const recordingPanelState: PanelState = {
  connected: true,
  status: { state: 'recording', tab: storyTab, startedAtMs: LIVE_STARTED_AT_MS },
  captures: liveStoryCaptures,
  error: null,
};

export const donePanelState: PanelState = {
  connected: true,
  status: {
    state: 'done',
    tab: storyTab,
    startedAtMs: STORY_STARTED_AT_MS,
    endedAtMs: STORY_STARTED_AT_MS + 94_000,
    endedBy: 'user',
    droppedFrames: 0,
  },
  captures: storyCaptures,
  error: null,
};

export const stoppingRecorderStatus: RecorderStatus = {
  state: 'stopping',
  tab: storyTab,
  startedAtMs: LIVE_STARTED_AT_MS,
};

export const interruptedRecorderStatus: RecorderStatus = {
  state: 'done',
  tab: storyTab,
  startedAtMs: STORY_STARTED_AT_MS,
  endedAtMs: STORY_STARTED_AT_MS + 94_000,
  endedBy: 'tab-closed',
  droppedFrames: 0,
};

export const droppedFramesRecorderStatus: RecorderStatus = {
  ...interruptedRecorderStatus,
  endedBy: 'user',
  droppedFrames: 14,
};
