import type { ReactNode } from 'react';
import { Route } from 'lucide-react';
import styles from './ReportBar.module.css';

export type ReportBarProps = Readonly<{
  title: string;
  /** Such as how long the recording ran and how many steps it has. */
  meta?: string;
  /** Before the title, such as a way back. */
  leading?: ReactNode;
  /** After the title: what the page offers to do with the report. */
  children?: ReactNode;
}>;

/** The report page's top bar. */
export function ReportBar({ title, meta, leading, children }: ReportBarProps) {
  return (
    <header className={styles['report-bar']}>
      {leading}
      <div className={styles['report-bar__brand']}>
        <Route aria-hidden />
        <span title={title}>{title}</span>
      </div>
      {meta && <div className={styles['report-bar__meta']}>{meta}</div>}
      {children}
    </header>
  );
}
