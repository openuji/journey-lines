import type { RecordingItem, RecordingMeta } from './recording-store';

export const REPORT_PORT = 'recording-report';

export type ReportRequest =
  | Readonly<{ type: 'get'; sessionId: string }>
  | Readonly<{ type: 'item'; sessionId: string; index: number }>;

export type ReportResponse =
  | Readonly<{ type: 'summary'; meta: RecordingMeta; total: number }>
  | Readonly<{ type: 'item'; index: number; item: RecordingItem }>
  | Readonly<{ type: 'error'; message: string }>;

export function reportUrl(sessionId: string): string {
  return `${chrome.runtime.getURL('report.html')}?session=${encodeURIComponent(sessionId)}`;
}
