/**
 * Everything the service worker and the side panel say to each other.
 *
 * They talk over one long-lived port per open panel. On connect the worker
 * sends a `snapshot`, so a panel opened mid-recording catches up, then every
 * change as it happens.
 */

import type { MilestoneCapture } from '@openuji/core';

export const JOURNEY_PORT = 'journey';

export type TabSummary = Readonly<{
  id: number;
  title: string;
  url: string;
}>;

/** Who ended a recording: the person, or Chrome on their behalf. */
export type EndedBy = 'user' | 'tab-closed' | 'debugging-cancelled';

/** Times are Unix epoch ms on the recorder's clock, as captures are. */
export type RecorderStatus =
  | Readonly<{ state: 'idle' }>
  | Readonly<{
      state: 'recording' | 'stopping';
      tab: TabSummary;
      startedAtMs: number;
    }>
  | Readonly<{
      state: 'done';
      tab: TabSummary;
      startedAtMs: number;
      endedAtMs: number;
      endedBy: EndedBy;
      /** Screencast frames evicted under backpressure; captures may be coarser. */
      droppedFrames: number;
    }>;

/** Panel → worker. */
export type PanelMessage =
  | Readonly<{ type: 'record'; tabId: number }>
  | Readonly<{ type: 'stop' }>
  /** Leave the finished recording and go back to idle. */
  | Readonly<{ type: 'reset' }>;

/** Worker → panel. */
export type WorkerMessage =
  | Readonly<{ type: 'snapshot'; status: RecorderStatus; captures: readonly MilestoneCapture[] }>
  | Readonly<{ type: 'capture'; capture: MilestoneCapture }>
  | Readonly<{ type: 'status'; status: RecorderStatus }>
  /** A request from this panel failed, e.g. Chrome refused to attach. */
  | Readonly<{ type: 'error'; message: string }>;
