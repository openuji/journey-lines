/**
 * Everything the service worker and the side panel say to each other.
 *
 * They talk over one long-lived port per open panel. On connect the worker
 * sends a `snapshot`, so a panel opened mid-recording catches up, then every
 * change as it happens.
 */

import type { Clip, MilestoneCapture } from '@openuji/core';
import type { ActiveTabState } from '@openuji/fused';

export const JOURNEY_PORT = 'journey';

export type TabSummary = Readonly<{
  id: number;
  windowId: number;
  title: string;
  url: string;
}>;

/** Who ended a recording: the person, or Chrome on their behalf. */
export type EndedBy = 'user' | 'window-closed' | 'debugging-cancelled';

/** The tab in front of the person, and what the recording does with it. */
export type ActiveTab = Readonly<{ tab: TabSummary; state: ActiveTabState }>;

/** Times are Unix epoch ms on the recorder's clock, as captures are. */
export type RecorderStatus =
  | Readonly<{ state: 'idle' }>
  | Readonly<{
      state: 'recording' | 'stopping';
      /** The tab the recording started in. */
      tab: TabSummary;
      /** The recording follows the active tab of `tab`'s window. */
      active: ActiveTab;
      startedAtMs: number;
    }>
  | Readonly<{
      state: 'done';
      /** Present when the completed recording can be opened in a report. */
      sessionId?: string;
      tab: TabSummary;
      startedAtMs: number;
      endedAtMs: number;
      endedBy: EndedBy;
      /** Screencast frames evicted under backpressure; captures may be coarser. */
      droppedFrames: number;
    }>;

/** How a recording is made: the person's choices before Record. */
export type RecordOptions = Readonly<{
  /** Also record a video of each scroll. */
  video: boolean;
}>;

/** Panel → worker. */
export type PanelMessage =
  | Readonly<{ type: 'record'; tabId: number; options: RecordOptions }>
  | Readonly<{ type: 'stop' }>
  /** Leave the finished recording and go back to idle. */
  | Readonly<{ type: 'reset' }>;

/** Worker → panel. */
export type WorkerMessage =
  | Readonly<{
      type: 'snapshot';
      status: RecorderStatus;
      captures: readonly MilestoneCapture[];
      clips: readonly Clip[];
    }>
  | Readonly<{ type: 'capture'; capture: MilestoneCapture }>
  /** A scroll's video is ready; it belongs to the capture with its `viewId` and `label`. */
  | Readonly<{ type: 'clip'; clip: Clip }>
  | Readonly<{ type: 'status'; status: RecorderStatus }>
  /** A request from this panel failed, e.g. Chrome refused to attach. */
  | Readonly<{ type: 'error'; message: string }>;
