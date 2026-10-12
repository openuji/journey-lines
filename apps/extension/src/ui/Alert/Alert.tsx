import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../IconButton/IconButton';
import styles from './Alert.module.css';

export function Alert({
  children,
  onDismiss,
  className,
}: {
  children: ReactNode;
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <div className={[styles['ui-alert'], className].filter(Boolean).join(' ')} role="alert">
      <span className={styles['ui-alert__content']}>{children}</span>
      <IconButton label="Dismiss" onClick={onDismiss}>
        <X />
      </IconButton>
    </div>
  );
}
