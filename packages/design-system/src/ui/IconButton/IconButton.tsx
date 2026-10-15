import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import styles from './IconButton.module.css';

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  label: string;
  /** `small` beside text; `default` where the button is a main way on, such as previous and next. */
  size?: 'small' | 'default';
};

export function IconButton({ label, className, size = 'small', type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      aria-label={label}
      className={clsx(styles['ui-icon-button'], size === 'default' && styles['ui-icon-button--default'], className)}
      type={type}
    />
  );
}
