import { useMemo, useReducer, useState } from 'react';
import {
  emptyDraft,
  journeyTemplate,
  recordingEvents,
  reportReducer,
  type ReportDraft,
  type ReportMode,
  type ReportTemplate,
  type StoredRecording,
} from '@openuji/journey';
import { Button } from '../Button/Button';
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

/** The report editor: holds the draft while it is written. No extension APIs, ports, or location access. */
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
  const events = useMemo(() => session ? recordingEvents(session) : [], [session]);

  return (
    <>
      <ReportBar recording={session} steps={events.length}>
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
      <main className={styles['report-doc']}>
        {error && <p className={styles['report-message']} role="alert">{error}</p>}
        {!error && !session && <p className={styles['report-message']} role="status">Loading report…</p>}
        {session && (
          <ReportDocument
            events={events}
            draft={draft}
            template={template}
            onEdit={mode === 'edit' ? dispatch : undefined}
          />
        )}
      </main>
    </>
  );
}
