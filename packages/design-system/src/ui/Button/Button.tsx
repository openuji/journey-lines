import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import styles from './Button.module.css';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet';
  size?: 'small' | 'default';
};

export function Button({
  variant = 'secondary',
  size = 'default',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = clsx(
    styles['ui-button'],
    styles[`ui-button--${variant}`],
    styles[`ui-button--${size}`],
    className,
  );

  return <button {...props} className={classes} type={type} />;
}
