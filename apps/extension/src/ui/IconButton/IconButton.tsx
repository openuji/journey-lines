import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import styles from './IconButton.module.css';

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  label: string;
};

export function IconButton({ label, className, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      aria-label={label}
      className={clsx(styles['ui-icon-button'], className)}
      type={type}
    />
  );
}
