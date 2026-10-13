import { useEffect, useState } from 'react';
import { journeyTemplate, REPORT_VERSION, type ReportDraft, type StoredRecording } from '@openuji/journey';
import { ReportView } from '@openuji/design-system';
import { loadSettings } from '../../lib/settings';
import { downloadReport } from '../../lib/report-download';
import { loadReport } from '../../lib/report-port';

/** The template every report from this extension is written in. */
const template = journeyTemplate;

/** Chrome-only adapter: the view itself needs only a completed recording. */
export function Report() {
  const sessionId = new URLSearchParams(location.search).get('session');
  const [session, setSession] = useState<StoredRecording | null>(null);
  const [error, setError] = useState<string | null>(sessionId ? null : 'No recording specified.');
  const [downloading, setDownloading] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<readonly string[]>([]);

  // Suggestions are a convenience: a settings problem must not keep a report from being written.
  useEffect(() => {
    void loadSettings().then((settings) => setTagSuggestions(settings.report.tags), () => {});
  }, []);

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

  return <ReportView session={session} template={template} tagSuggestions={tagSuggestions} error={error} downloading={downloading} onDownload={download} />;
}
