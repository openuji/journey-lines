import { useEffect, useState } from 'react';
import { downloadReport } from '../../lib/report-download';
import { loadReport } from '../../lib/report-port';
import type { StoredRecording } from '../../lib/recording-store';
import { ReportView } from './ReportView';

/** Chrome-only adapter: the view itself needs only a completed recording. */
export function Report() {
  const sessionId = new URLSearchParams(location.search).get('session');
  const [session, setSession] = useState<StoredRecording | null>(null);
  const [error, setError] = useState<string | null>(sessionId ? null : 'No recording specified.');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const loading = loadReport(sessionId);
    void loading.promise.then(
      (recording) => { if (active) { setSession(recording); setError(null); } },
      (reason: unknown) => { if (active) setError(String(reason instanceof Error ? reason.message : reason)); },
    );
    return () => { active = false; loading.close(); };
  }, [sessionId]);

  useEffect(() => {
    if (session) document.title = `${session.meta.tab.title || session.meta.tab.url || 'Recording'} — Recording report`;
  }, [session]);

  const download = (): void => {
    if (!session || downloading) return;
    setDownloading(true);
    try {
      downloadReport(session);
    } catch (reason) {
      setError(`Download failed: ${String(reason)}`);
    } finally {
      setDownloading(false);
    }
  };

  return <ReportView session={session} error={error} downloading={downloading} onDownload={download} />;
}
