import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTone =
  'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'achievement' | 'emblem';

interface BadgeProps {
  tone?: BadgeTone;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', icon, className, children }: BadgeProps) {
  return (
    <span className={clsx(styles.badge, styles[tone], className)}>
      {icon}
      {children}
    </span>
  );
}
