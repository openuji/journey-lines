import type { HTMLAttributes, ReactNode } from 'react';
import styles from './StatusBadge.module.css';

export type StatusBadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  tone?: 'live' | 'neutral';
  dot?: boolean;
  children: ReactNode;
};

export function StatusBadge({
  tone = 'neutral',
  dot = true,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      {...props}
      className={[styles['ui-status-badge'], styles[`ui-status-badge--${tone}`], className]
        .filter(Boolean)
        .join(' ')}
    >
      {dot && <span className={styles['ui-status-badge__dot']} aria-hidden />}
      {children}
    </span>
  );
}
