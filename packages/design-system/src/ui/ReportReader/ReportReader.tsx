import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { recordingEvents, type ReportExport } from '@openuji/journey';
import { ReportBar } from '../ReportBar/ReportBar';
import { ReportDocument } from '../ReportDocument/ReportDocument';
import styles from './ReportReader.module.css';

export type ReportReaderProps = Readonly<{
  /** Null while it loads. */
  report: ReportExport | null;
  error?: string | null;
  /** Where the reader came from, such as the list of journeys. */
  back?: Readonly<{ href: string; label: string }>;
}>;

/** A finished report as its readers see it: what was written, around the steps that were kept. Holds no state. */
export function ReportReader({ report, error = null, back }: ReportReaderProps) {
  const events = useMemo(() => report ? recordingEvents(report.recording) : [], [report]);
  const backLink = back && (
    <a className={styles['report-back']} href={back.href}>
      <ArrowLeft aria-hidden />
      {back.label}
    </a>
  );

  return (
    <>
      <ReportBar recording={report?.recording ?? null} steps={events.length} leading={backLink} />
      <main className={styles['report-doc']}>
        {error && <p className={styles['report-message']} role="alert">{error}</p>}
        {!error && !report && <p className={styles['report-message']} role="status">Loading report…</p>}
        {report && <ReportDocument events={events} draft={report.draft} template={report.template} />}
      </main>
    </>
  );
}
