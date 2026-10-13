import { useMemo, useReducer, useState } from 'react';
import {
  emptyDraft,
  entryFiles,
  formatClock,
  inlineMedia,
  journeyEntry,
  journeyTemplate,
  recordingEvents,
  recordingTitle,
  REPORT_VERSION,
  reportReducer,
  type ReportDraft,
  type ReportMode,
  type ReportTemplate,
  type StoredRecording,
} from '@openuji/journey';
import { useRecordingMedia } from '../../hooks/useRecordingMedia';
import { Button } from '../Button/Button';
import { ReaderDocument } from '../ReaderDocument/ReaderDocument';
import { ReportBar } from '../ReportBar/ReportBar';
import { ReportDocument } from '../ReportDocument/ReportDocument';
import styles from './ReportView.module.css';

export type ReportViewProps = {
  session: StoredRecording | null;
  template?: ReportTemplate;
  /** What editing starts from, such as a report read back from its archive. */
  initialDraft?: ReportDraft;
  error?: string | null;
  downloading?: boolean;
  onDownload?: (draft: ReportDraft) => void;
};

/**
 * The report editor: holds the draft while it is written. Its preview is what
 * readers get, the journey's entry in the reader, as the journeys app shows it.
 * No extension APIs, ports, or location access.
 */
export function ReportView({
  session,
  template = journeyTemplate,
  initialDraft = emptyDraft,
  error = null,
  downloading = false,
  onDownload,
}: ReportViewProps) {
  const [draft, dispatch] = useReducer(reportReducer, initialDraft);
  const [mode, setMode] = useState<ReportMode>('edit');
  const events = useMemo(() => session ? recordingEvents(session, inlineMedia) : [], [session]);
  const preview = useMemo(
    () => session && mode === 'preview' ? journeyEntry({ version: REPORT_VERSION, template, draft, recording: session }) : null,
    [session, mode, template, draft],
  );
  const media = useRecordingMedia(session, preview ? entryFiles(preview) : []);

  return (
    <>
      <ReportBar
        title={session ? recordingTitle(session.meta) : 'Recording report'}
        meta={session ? `${formatClock(session.meta.endedAtMs - session.meta.startedAtMs)} · ${events.length} events` : undefined}
      >
        {session && (
          <>
            <Button size="small" onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>
              {mode === 'edit' ? 'Preview' : 'Edit'}
            </Button>
            <Button variant="primary" size="small" onClick={() => onDownload?.(draft)} disabled={!onDownload || downloading}>
              {downloading ? 'Preparing…' : 'Download .zip'}
            </Button>
          </>
        )}
      </ReportBar>
      <main>
        {error && <p className={styles['report-message']} role="alert">{error}</p>}
        {!error && !session && <p className={styles['report-message']} role="status">Loading report…</p>}
        {session && !preview && (
          <div className={styles['report-doc']}>
            <ReportDocument events={events} draft={draft} template={template} onEdit={dispatch} />
          </div>
        )}
        {preview && <ReaderDocument entry={preview} media={media} />}
      </main>
    </>
  );
}
