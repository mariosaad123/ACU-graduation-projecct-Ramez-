import clsx from 'clsx';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import styles from './IconButton.module.css';

interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children' | 'aria-label'> {
  /** Required: an icon alone gives screen reader users nothing to go on. */
  label: string;
  icon: ReactNode;
  size?: 'sm' | 'md';
}

export function IconButton({
  label,
  icon,
  size = 'md',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={clsx(styles.iconButton, styles[size], className)}
      {...rest}
    >
      {icon}
    </button>
  );
}
