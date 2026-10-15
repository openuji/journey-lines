import { useEffect, useState } from 'react';
import { getJourneyTemplate, REPORT_VERSION, type ReportDraft, type StoredRecording } from '@journey-lines/journey';
import { ReportView, useTranslation } from '@journey-lines/design-system';
import { loadReportSettings, defaultReportSettings, type ReportSettings } from '../../lib/settings';
import { downloadReport } from '../../lib/report-download';
import { loadReport } from '../../lib/report-port';
import { ExtensionTranslationProvider } from '../../localisation/TranslationProvider';

/** Chrome-only adapter: the view itself needs only a completed recording. */
export function Report() {
  const [reportSettings, setReportSettings] = useState<ReportSettings | null>(null);
  useEffect(() => {
    let active = true;
    void loadReportSettings().then((settings) => { if (active) setReportSettings(settings); });
    return () => { active = false; };
  }, []);

  return (
    <ExtensionTranslationProvider language={reportSettings?.language ?? defaultReportSettings.language}>
      <ReportPage reportSettings={reportSettings} />
    </ExtensionTranslationProvider>
  );
}

function ReportPage({ reportSettings }: { reportSettings: ReportSettings | null }) {
  const sessionId = new URLSearchParams(location.search).get('session');
  const [session, setSession] = useState<StoredRecording | null>(null);
  const [failure, setFailure] = useState<{ kind: 'load' | 'download'; detail: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const language = reportSettings?.language ?? defaultReportSettings.language;
  const template = getJourneyTemplate(language);
  const locale = { language, dir: 'ltr' } as const;
  const { t } = useTranslation();
  const error = !sessionId ? t('report.noRecording') : failure
    ? t(failure.kind === 'load' ? 'report.loadFailed' : 'report.downloadFailed', { detail: failure.detail }) : null;

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const loading = loadReport(sessionId);
    void loading.promise.then(
      (recording) => { if (active) { setSession(recording); setFailure(null); } },
      (reason: unknown) => { if (active) setFailure({ kind: 'load', detail: String(reason instanceof Error ? reason.message : reason) }); },
    );
    return () => { active = false; loading.close(); };
  }, [sessionId]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = 'ltr';
    document.title = t('report.pageTitle', { title: session?.meta.tab.title || session?.meta.tab.url || t('report.title') });
  }, [session, language, t]);

  const download = (draft: ReportDraft): void => {
    if (!session || !reportSettings || downloading) return;
    setDownloading(true);
    try {
      downloadReport({ version: REPORT_VERSION, template, draft, recording: session });
    } catch (reason) {
      setFailure({ kind: 'download', detail: String(reason) });
    } finally {
      setDownloading(false);
    }
  };

  return <ReportView session={reportSettings ? session : null} template={template} locale={locale} tagSuggestions={reportSettings?.tags} error={error} downloading={downloading} onDownload={reportSettings ? download : undefined} />;
}
