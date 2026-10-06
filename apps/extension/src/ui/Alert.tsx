import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

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
    <div className={['ui-alert', className].filter(Boolean).join(' ')} role="alert">
      <span className="ui-alert__content">{children}</span>
      <IconButton label="Dismiss" onClick={onDismiss}>
        <X size={16} />
      </IconButton>
    </div>
  );
}
