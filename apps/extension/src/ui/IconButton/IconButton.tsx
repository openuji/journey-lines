import type { ButtonHTMLAttributes } from 'react';
import styles from './IconButton.module.css';

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  label: string;
};

export function IconButton({ label, className, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      aria-label={label}
      className={[styles['ui-icon-button'], className].filter(Boolean).join(' ')}
      type={type}
    />
  );
}
