import type { ComponentPropsWithRef, ReactNode } from 'react';
import { buttonClassName, type ButtonStyleOptions } from './button-styles';
import { Spinner } from './Spinner';
import styles from './Button.module.css';

export interface ButtonProps extends ComponentPropsWithRef<'button'>, ButtonStyleOptions {
  loading?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
}

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  iconStart,
  iconEnd,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, fullWidth }, className)}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size="1.1em" tone="current" label={false} /> : iconStart}
      <span className={styles.label}>{children}</span>
      {!loading && iconEnd}
    </button>
  );
}
