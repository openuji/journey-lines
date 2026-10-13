import { useEffect, useState } from 'react';
import { REPORT_VERSION } from '../../lib/report-archive';
import { downloadReport } from '../../lib/report-download';
import type { ReportDraft } from '../../lib/report-draft';
import { loadReport } from '../../lib/report-port';
import { journeyTemplate } from '../../lib/report-template';
import type { StoredRecording } from '../../lib/recording-store';
import { ReportView } from '../../ui/ReportView/ReportView';

/** The template every report from this extension is written in. */
const template = journeyTemplate;

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

  const download = (draft: ReportDraft): void => {
    if (!session || downloading) return;
    setDownloading(true);
    try {
      downloadReport({ version: REPORT_VERSION, template, draft, recording: session });
    } catch (reason) {
      setError(`Download failed: ${String(reason)}`);
    } finally {
      setDownloading(false);
    }
  };

  return <ReportView session={session} template={template} error={error} downloading={downloading} onDownload={download} />;
}
