import type { HTMLAttributes, ReactNode } from 'react';

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
      className={['ui-status-badge', `ui-status-badge--${tone}`, className]
        .filter(Boolean)
        .join(' ')}
    >
      {dot && <span className="ui-status-badge__dot" aria-hidden />}
      {children}
    </span>
  );
}
