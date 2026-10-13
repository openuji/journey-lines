/**
 * A completed recording as the extension keeps it and the report archive
 * carries it: the tab it started in, its span, and its captures and clips in
 * arrival order.
 */

import type { Clip, MilestoneCapture } from '@openuji/core';
import { shortUrl } from './format.js';

export type TabSummary = Readonly<{
  id: number;
  windowId: number;
  title: string;
  url: string;
}>;

/** Who ended a recording: the person, or Chrome on their behalf. */
export type EndedBy = 'user' | 'window-closed' | 'debugging-cancelled';

export type RecordingItem =
  | Readonly<{ kind: 'capture'; epochMs: number; capture: MilestoneCapture }>
  | Readonly<{ kind: 'clip'; epochMs: number; clip: Clip }>;

export type RecordingMeta = Readonly<{
  id: string;
  tab: TabSummary;
  startedAtMs: number;
  endedAtMs: number;
  endedBy: EndedBy;
  droppedFrames: number;
}>;

export type StoredRecording = Readonly<{ meta: RecordingMeta; items: readonly RecordingItem[] }>;

/** What a recording is called before anyone has written a title: the page it started on. */
export function recordingTitle(meta: RecordingMeta): string {
  return meta.tab.title || shortUrl(meta.tab.url) || 'Recording';
}
