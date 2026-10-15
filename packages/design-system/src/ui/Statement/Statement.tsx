import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './Statement.module.css';

export type StatementProps = Readonly<{
  label: string;
  children: ReactNode;
  /** A problem stands apart, in indigo on its own tint. */
  tone?: 'plain' | 'problem';
  className?: string;
}>;

/** Something written about a journey, under the label the template gives it. */
export function Statement({ label, children, tone = 'plain', className }: StatementProps) {
  return (
    <div className={clsx(styles['statement'], tone === 'problem' && styles['statement--problem'], className)}>
      <span className={styles['statement__label']}>{label}</span>
      <p className={styles['statement__text']}>{children}</p>
    </div>
  );
}
