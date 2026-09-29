import {
  CheckCircleIcon,
  InfoIcon,
  WarningCircleIcon,
  XIcon,
  XCircleIcon,
  type Icon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AlertTone } from '../Alert';
import { IconButton } from '../IconButton';
import type { ToastRecord } from './toast-context';
import styles from './Toast.module.css';

const DEFAULT_DURATION_MS = 6000;

const ICONS: Record<AlertTone, Icon> = {
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: WarningCircleIcon,
  danger: XCircleIcon,
};

interface ToastItemProps {
  toast: ToastRecord;
  onDismiss: (id: number) => void;
}

/** Dismisses itself after a while, but waits while the pointer or keyboard focus is on it. */
export function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const { t } = useTranslation();
  const tone = toast.tone ?? 'info';
  const IconComponent = ICONS[tone];

  const remaining = useRef(toast.durationMs ?? DEFAULT_DURATION_MS);
  const startedAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const running = useRef(false);
  const hovered = useRef(false);
  const focused = useRef(false);

  const start = useCallback(() => {
    if (running.current) {
      return;
    }
    running.current = true;
    startedAt.current = Date.now();
    timer.current = window.setTimeout(() => {
      onDismiss(toast.id);
    }, remaining.current);
  }, [onDismiss, toast.id]);

  const stop = useCallback(() => {
    if (!running.current) {
      return;
    }
    running.current = false;
    window.clearTimeout(timer.current);
    remaining.current = Math.max(remaining.current - (Date.now() - startedAt.current), 0);
  }, []);

  const sync = useCallback(() => {
    if (hovered.current || focused.current) {
      stop();
    } else {
      start();
    }
  }, [start, stop]);

  useEffect(() => {
    start();
    return () => {
      running.current = false;
      window.clearTimeout(timer.current);
    };
  }, [start]);

  return (
    <li
      className={styles.toast}
      data-tone={tone}
      onPointerEnter={() => {
        hovered.current = true;
        sync();
      }}
      onPointerLeave={() => {
        hovered.current = false;
        sync();
      }}
      onFocus={() => {
        focused.current = true;
        sync();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          focused.current = false;
          sync();
        }
      }}
    >
      <IconComponent className={styles.icon} weight="fill" aria-hidden="true" />
      <div className={styles.content}>
        <p className={styles.title}>{toast.title}</p>
        {toast.description && <p className={styles.description}>{toast.description}</p>}
      </div>
      <IconButton
        label={t('toast.dismiss')}
        icon={<XIcon />}
        size="sm"
        onClick={() => {
          onDismiss(toast.id);
        }}
      />
    </li>
  );
}
