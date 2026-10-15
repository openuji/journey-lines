import { useMemo, useReducer, useState } from 'react';
import {
  emptyDraft,
  entryFiles,
  formatClock,
  inlineMedia,
  journeyEntry,
  localizeJourneyEntry,
  getJourneyTemplate,
  recordingEvents,
  recordingTitle,
  REPORT_VERSION,
  reportReducer,
  type ReportDraft,
  type ReportMode,
  type ReportTemplate,
  type StoredRecording,
} from '@journey-lines/journey';
import { useRecordingMedia } from '../../hooks/useRecordingMedia';
import { Button } from '../Button/Button';
import { ReaderDocument } from '../ReaderDocument/ReaderDocument';
import { ReportBar } from '../ReportBar/ReportBar';
import { ReportDocument } from '../ReportDocument/ReportDocument';
import styles from './ReportView.module.css';
import { defaultReportLocale, type ReportLocale } from '../report-locale';
import { TranslationProvider, useTranslation } from '../../localisation/TranslationProvider';

export type ReportViewProps = Readonly<{
  session: StoredRecording | null;
  template?: ReportTemplate;
  /** What editing starts from, such as a report read back from its archive. */
  initialDraft?: ReportDraft;
  /** Tags the editor offers with one click, such as the host's default tags. */
  tagSuggestions?: readonly string[];
  error?: string | null;
  downloading?: boolean;
  onDownload?: (draft: ReportDraft) => void;
  locale?: ReportLocale;
}>;

/**
 * The report editor: holds the draft while it is written. Its preview is what
 * readers get, the journey's entry in the reader, as the journeys app shows it.
 * No extension APIs, ports, or location access.
 */
export function ReportView(props: ReportViewProps) {
  const locale = props.locale ?? defaultReportLocale;
  return (
    <TranslationProvider language={locale.language} dir={locale.dir}>
      <ReportContent {...props} />
    </TranslationProvider>
  );
}

function ReportContent({
  session,
  template,
  initialDraft = emptyDraft,
  tagSuggestions,
  error = null,
  downloading = false,
  onDownload,
  locale = defaultReportLocale,
}: ReportViewProps) {
  const { t } = useTranslation();
  const resolvedTemplate = template ?? getJourneyTemplate(locale.language);
  const [draft, dispatch] = useReducer(reportReducer, initialDraft);
  const [mode, setMode] = useState<ReportMode>('edit');
  const events = useMemo(() => (session ? recordingEvents(session, inlineMedia) : []), [session]);
  const preview = useMemo(
    () =>
      session && mode === 'preview'
        ? localizeJourneyEntry(
            journeyEntry({ version: REPORT_VERSION, template: resolvedTemplate, draft, recording: session }),
            locale.language,
          )
        : null,
    [session, mode, resolvedTemplate, draft, locale.language],
  );
  const media = useRecordingMedia(session, preview ? entryFiles(preview) : []);

  return (
    <div lang={locale.language} dir={locale.dir}>
      <ReportBar
        title={session ? recordingTitle(session.meta) : t('report.title')}
        meta={
          session
            ? t('report.meta', {
                duration: formatClock(session.meta.endedAtMs - session.meta.startedAtMs),
                summary: t('report.events', { count: events.length }),
              })
            : undefined
        }
      >
        {session && (
          <>
            <Button size="small" onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>
              {t(mode === 'edit' ? 'report.preview' : 'report.edit')}
            </Button>
            <Button
              variant="primary"
              size="small"
              onClick={() => onDownload?.(draft)}
              disabled={!onDownload || downloading}
            >
              {t(downloading ? 'report.preparing' : 'report.download')}
            </Button>
          </>
        )}
      </ReportBar>
      <main>
        {error && (
          <p className={styles['report-message']} role="alert">
            {error}
          </p>
        )}
        {!error && !session && (
          <p className={styles['report-message']} role="status">
            {t('report.loading')}
          </p>
        )}
        {session && !preview && (
          <div className={styles['report-doc']}>
            <ReportDocument
              events={events}
              draft={draft}
              template={resolvedTemplate}
              tagSuggestions={tagSuggestions}
              onEdit={dispatch}
            />
          </div>
        )}
        {preview && <ReaderDocument entry={preview} media={media} />}
      </main>
    </div>
  );
}
