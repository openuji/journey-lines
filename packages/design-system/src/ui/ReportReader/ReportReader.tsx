import { ArrowLeft } from 'lucide-react';
import { formatClock, localizeJourneyEntry, type JourneyEntry } from '@journey-lines/journey';
import { GitHubLink } from '../GitHubLink/GitHubLink';
import { ReaderDocument } from '../ReaderDocument/ReaderDocument';
import type { ReaderMedia } from '../ReaderDocument/ReaderStep';
import { ReportBar } from '../ReportBar/ReportBar';
import styles from './ReportReader.module.css';
import { defaultReportLocale, type ReportLocale } from '../report-locale';
import { TranslationProvider, useTranslation } from '../../localisation/TranslationProvider';

export type ReportReaderProps = Readonly<{
  entry: JourneyEntry;
  /** Where each archive file the entry names can be loaded from. */
  media: ReaderMedia;
  /** Where the reader came from, such as the list of journeys. */
  back?: Readonly<{ href: string; label: string }>;
  /** The project repository offered from the page's top bar. */
  repositoryHref?: string;
  locale?: ReportLocale;
}>;

/** A published journey's page: its bar, then the report as its readers see it. */
export function ReportReader(props: ReportReaderProps) {
  const locale = props.locale ?? defaultReportLocale;
  return (
    <TranslationProvider language={locale.language} dir={locale.dir}>
      <ReaderContent {...props} />
    </TranslationProvider>
  );
}

function ReaderContent({ entry, media, back, repositoryHref, locale = defaultReportLocale }: ReportReaderProps) {
  const { t } = useTranslation();
  const localized = localizeJourneyEntry(entry, locale.language);
  const backLink = back && (
    <a className={styles['report-back']} href={back.href}>
      <ArrowLeft aria-hidden />
      {back.label}
    </a>
  );

  return (
    <div lang={locale.language} dir={locale.dir}>
      <ReportBar
        title={entry.title}
        meta={t('report.meta', {
          duration: formatClock(entry.endedAtMs - entry.startedAtMs),
          summary: t('report.steps', { count: entry.steps.length }),
        })}
        leading={backLink}
      >
        {repositoryHref && (
          <GitHubLink
            className={styles['report-repository']}
            href={repositoryHref}
            label={t('repository.open')}
          />
        )}
      </ReportBar>
      <main>
        <ReaderDocument entry={localized} media={media} />
      </main>
    </div>
  );
}
