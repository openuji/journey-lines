import { useMemo, useReducer, useState } from 'react';
import { Route } from 'lucide-react';
import { formatClock, shortUrl } from '../../lib/journey';
import { journeyEvents } from '../../lib/journey-events';
import type { StoredRecording } from '../../lib/recording-store';
import { emptyDraft, reportReducer, type ReportDraft, type ReportMode } from '../../lib/report-draft';
import { journeyTemplate, type ReportTemplate } from '../../lib/report-template';
import { Button } from '../Button/Button';
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

function titleOf(session: StoredRecording): string {
  return session.meta.tab.title || shortUrl(session.meta.tab.url) || 'Recording';
}

/** Data-driven report surface: no extension APIs, ports, or location access. */
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
  const events = useMemo(() => {
    if (!session) return [];
    const captures = session.items.flatMap((item) => item.kind === 'capture' ? [item.capture] : []);
    const clips = session.items.flatMap((item) => item.kind === 'clip' ? [item.clip] : []);
    return journeyEvents(captures, session.meta.startedAtMs, clips);
  }, [session]);

  return (
    <>
      <header className={styles['report-bar']}>
        <div className={styles['report-bar__brand']}>
          <Route aria-hidden />
          <span title={session ? titleOf(session) : 'Recording report'}>{session ? titleOf(session) : 'Recording report'}</span>
        </div>
        {session && (
          <>
            <div className={styles['report-bar__meta']}>
              {formatClock(session.meta.endedAtMs - session.meta.startedAtMs)} · {events.length} events
            </div>
            <Button size="small" onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>
              {mode === 'edit' ? 'Preview' : 'Edit'}
            </Button>
            <Button variant="primary" size="small" onClick={() => onDownload?.(draft)} disabled={!onDownload || downloading}>
              {downloading ? 'Preparing…' : 'Download .zip'}
            </Button>
          </>
        )}
      </header>
      <main className={styles['report-doc']}>
        {error && <p className={styles['report-message']} role="alert">{error}</p>}
        {!error && !session && <p className={styles['report-message']} role="status">Loading report…</p>}
        {session && <ReportDocument events={events} draft={draft} mode={mode} dispatch={dispatch} template={template} />}
      </main>
    </>
  );
}
