import { REPORT_PORT, type ReportRequest, type ReportResponse } from './report-protocol';
import type { RecordingItem, StoredRecording } from './recording-store';

/** Pull one item per message so Chrome never receives a whole recording at once. */
export function loadReport(sessionId: string): { promise: Promise<StoredRecording>; close(): void } {
  const port = chrome.runtime.connect({ name: REPORT_PORT });
  let settled = false;
  let rejectLoad: ((error: Error) => void) | null = null;
  const fail = (message: string): void => {
    if (settled) return;
    settled = true;
    rejectLoad?.(new Error(message));
    port.disconnect();
  };
  const promise = new Promise<StoredRecording>((resolve, reject) => {
    rejectLoad = reject;
    let meta: StoredRecording['meta'] | null = null;
    let total = 0;
    const items: RecordingItem[] = [];
    const request = (message: ReportRequest): void => port.postMessage(message);
    const finish = (): void => {
      if (!meta || settled) return;
      settled = true;
      resolve({ meta, items });
      port.disconnect();
    };
    port.onMessage.addListener((message: ReportResponse) => {
      if (settled) return;
      if (message.type === 'error') return fail(message.message);
      if (message.type === 'summary') {
        meta = message.meta;
        total = message.total;
        if (total === 0) finish();
        else request({ type: 'item', sessionId, index: 0 });
      } else if (message.type === 'item') {
        if (message.index !== items.length) return fail('Recording arrived out of order.');
        items.push(message.item);
        if (items.length === total) finish();
        else request({ type: 'item', sessionId, index: items.length });
      }
    });
    port.onDisconnect.addListener(() => {
      if (!settled) fail('Recording unavailable.');
    });
    request({ type: 'get', sessionId });
  });
  return { promise, close: () => fail('Report loading cancelled.') };
}
