import type { Notification, NotificationKind } from '@acu/shared';
import {
  AtIcon,
  ChartBarIcon,
  ChatCircleIcon,
  GraduationCapIcon,
  MegaphoneIcon,
  ShieldStarIcon,
} from '@phosphor-icons/react';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useLocale } from '../../i18n/use-locale';
import styles from './Notifications.module.css';

const ICONS: Record<NotificationKind, ReactNode> = {
  mention: <AtIcon aria-hidden="true" />,
  announcement: <MegaphoneIcon aria-hidden="true" />,
  poll: <ChartBarIcon aria-hidden="true" />,
  grade: <GraduationCapIcon aria-hidden="true" />,
  role: <ShieldStarIcon aria-hidden="true" />,
  message: <ChatCircleIcon aria-hidden="true" />,
};

function useRelativeTime() {
  const { intlLocale } = useLocale();
  return useMemo(() => {
    const format = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' });
    return (iso: string) => {
      const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
      if (Math.abs(minutes) < 60) {
        return format.format(minutes, 'minute');
      }
      const hours = Math.round(minutes / 60);
      return Math.abs(hours) < 24
        ? format.format(hours, 'hour')
        : format.format(Math.round(hours / 24), 'day');
    };
  }, [intlLocale]);
}

interface NotificationListProps {
  notifications: readonly Notification[];
  /** Called when one is opened, so it can be marked read and any popover closed. */
  onOpen: (notification: Notification) => void;
}

/** Notifications as a list of links: what happened, where, and the text that goes with it. */
export function NotificationList({ notifications, onOpen }: NotificationListProps) {
  const { t } = useTranslation();
  const relative = useRelativeTime();

  return (
    <ul className={styles.list}>
      {notifications.map((notification) => {
        const actor = notification.actor?.name ?? '';
        const group = notification.group.name;
        // A role notification carries the role itself; the rest carry text to quote.
        const detail =
          notification.kind === 'role'
            ? notification.excerpt &&
              ['assistant', 'moderator', 'representative'].includes(notification.excerpt)
              ? t(`roles.${notification.excerpt as 'assistant' | 'moderator' | 'representative'}`)
              : null
            : (notification.excerpt?.replaceAll('@all', `@${t('chat.everyone')}`) ?? null);
        return (
          <li key={notification.id}>
            <Link
              to={notification.link}
              className={styles.item}
              data-unread={!notification.read}
              onClick={() => {
                onOpen(notification);
              }}
            >
              <span className={styles.icon} data-kind={notification.kind}>
                {ICONS[notification.kind]}
              </span>
              <span className={styles.text}>
                <span className={styles.what}>
                  {t(`notifications.kinds.${notification.kind}`, { actor, group })}
                </span>
                {detail && (
                  <span className={styles.excerpt} dir="auto">
                    {detail}
                  </span>
                )}
                <time className={styles.when} dateTime={notification.createdAt}>
                  {relative(notification.createdAt)}
                </time>
              </span>
              {!notification.read && (
                <span className={styles.dot}>
                  <span className="visually-hidden">{t('notifications.unread')}</span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
