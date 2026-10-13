import { ArrowLeft } from 'lucide-react';
import { formatClock, type JourneyEntry } from '@openuji/journey';
import { ReaderDocument } from '../ReaderDocument/ReaderDocument';
import type { ReaderMedia } from '../ReaderDocument/ReaderStep';
import { ReportBar } from '../ReportBar/ReportBar';
import styles from './ReportReader.module.css';

export type ReportReaderProps = Readonly<{
  entry: JourneyEntry;
  /** Where each archive file the entry names can be loaded from. */
  media: ReaderMedia;
  /** Where the reader came from, such as the list of journeys. */
  back?: Readonly<{ href: string; label: string }>;
}>;

/** A published journey's page: its bar, then the report as its readers see it. */
export function ReportReader({ entry, media, back }: ReportReaderProps) {
  const backLink = back && (
    <a className={styles['report-back']} href={back.href}>
      <ArrowLeft aria-hidden />
      {back.label}
    </a>
  );

  return (
    <>
      <ReportBar
        title={entry.title}
        meta={`${formatClock(entry.endedAtMs - entry.startedAtMs)} · ${entry.steps.length} steps`}
        leading={backLink}
      />
      <main>
        <ReaderDocument entry={entry} media={media} />
      </main>
    </>
  );
}
