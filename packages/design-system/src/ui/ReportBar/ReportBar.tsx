import type { ReactNode } from 'react';
import { Route } from 'lucide-react';
import { formatClock, recordingTitle, type StoredRecording } from '@openuji/journey';
import styles from './ReportBar.module.css';

export type ReportBarProps = Readonly<{
  /** Null while the recording loads. */
  recording: StoredRecording | null;
  /** How many steps the report shows. */
  steps: number;
  /** Before the title, such as a way back. */
  leading?: ReactNode;
  /** After the title: what the page offers to do with the report. */
  children?: ReactNode;
}>;

/** The report page's top bar: what was recorded, how long, how many steps. */
export function ReportBar({ recording, steps, leading, children }: ReportBarProps) {
  const title = recording ? recordingTitle(recording.meta) : 'Recording report';
  return (
    <header className={styles['report-bar']}>
      {leading}
      <div className={styles['report-bar__brand']}>
        <Route aria-hidden />
        <span title={title}>{title}</span>
      </div>
      {recording && (
        <div className={styles['report-bar__meta']}>
          {formatClock(recording.meta.endedAtMs - recording.meta.startedAtMs)} · {steps} events
        </div>
      )}
      {children}
    </header>
  );
}
