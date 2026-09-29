import {
  CheckCircleIcon,
  InfoIcon,
  WarningCircleIcon,
  XCircleIcon,
  type Icon,
} from '@phosphor-icons/react';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './Alert.module.css';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const ICONS: Record<AlertTone, Icon> = {
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: WarningCircleIcon,
  danger: XCircleIcon,
};

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  /** Set when the alert appears in response to an action, so assistive technology announces it. */
  live?: boolean;
  className?: string;
  children: ReactNode;
}

export function Alert({ tone = 'info', title, live = false, className, children }: AlertProps) {
  const IconComponent = ICONS[tone];
  const role = live ? (tone === 'danger' ? 'alert' : 'status') : undefined;

  return (
    <div className={clsx(styles.alert, styles[tone], className)} role={role}>
      <IconComponent className={styles.icon} weight="fill" aria-hidden="true" />
      <div className={styles.body}>
        {title && <p className={styles.title}>{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
