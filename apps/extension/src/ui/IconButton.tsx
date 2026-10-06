import type { ButtonHTMLAttributes } from 'react';

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  label: string;
};

export function IconButton({ label, className, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      aria-label={label}
      className={['ui-icon-button', className].filter(Boolean).join(' ')}
      type={type}
    />
  );
}
