import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { buttonClassName, type ButtonStyleOptions } from './button-styles';

interface ButtonLinkProps extends LinkProps, ButtonStyleOptions {
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
}

export function ButtonLink({
  variant,
  size,
  fullWidth,
  iconStart,
  iconEnd,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClassName({ variant, size, fullWidth }, className)} {...rest}>
      {iconStart}
      {children}
      {iconEnd}
    </Link>
  );
}
