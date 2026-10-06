/**
 * The journey as the panel lists it. Deliberately raw for now: one row per
 * capture, labelled as the rules named it, with a divider where a view starts.
 */

import type { MilestoneCapture, ViewEntry } from '@openuji/core';
import { DocumentLabel } from '@openuji/rules-document';
import { InteractionLabel } from '@openuji/rules-interaction';

/** What a capture shows, as one icon in the panel. */
export type CaptureKind = 'view' | 'click' | 'leave';

export type JourneyRow =
  | Readonly<{ kind: 'view'; key: string; entry: ViewEntry; url: string }>
  | Readonly<{
      kind: 'capture';
      key: string;
      capture: MilestoneCapture;
      captureKind: CaptureKind;
      /** Since the recording started. */
      atMs: number;
    }>;

export function captureKind(label: string): CaptureKind {
  if (label === DocumentLabel.beforeNavigation) return 'leave';
  if (label.startsWith(InteractionLabel.preClick) || label.startsWith(InteractionLabel.postClick)) {
    return 'click';
  }
  // 00-first, 01-domcontentloaded, 02-settled: the view's own milestones.
  return 'view';
}

export function journeyRows(
  captures: readonly MilestoneCapture[],
  startedAtMs: number,
): JourneyRow[] {
  const rows: JourneyRow[] = [];
  let viewId: number | undefined;

  captures.forEach((capture, index) => {
    if (capture.viewId !== viewId) {
      viewId = capture.viewId;
      rows.push({ kind: 'view', key: `view-${index}`, entry: capture.entry, url: capture.url });
    }
    rows.push({
      kind: 'capture',
      key: `capture-${index}`,
      capture,
      captureKind: captureKind(capture.label),
      atMs: capture.frame.receivedAtMs - startedAtMs,
    });
  });

  return rows;
}

/** `mm:ss`, as the panel shows every time. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Host and path: enough to tell views apart without the noise of a full URL. */
export function shortUrl(url: string): string {
  try {
    const { host, pathname, search, hash } = new URL(url);
    return `${host}${pathname}${search}${hash}`;
  } catch {
    return url;
  }
}

export function frameSrc(capture: MilestoneCapture): string {
  return `data:image/png;base64,${capture.frame.base64}`;
}
