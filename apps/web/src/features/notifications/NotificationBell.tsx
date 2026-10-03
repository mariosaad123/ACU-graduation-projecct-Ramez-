import { BellIcon } from '@phosphor-icons/react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Skeleton } from '../../components/ui/Skeleton';
import { usePopover } from '../../components/ui/use-popover';
import { useMarkNotificationsRead, useNotifications, useUnreadNotifications } from './api';
import { NotificationList } from './NotificationList';
import styles from './Notifications.module.css';

/** The bell in the header: how many notifications are unread, and the latest ones a press away. */
export function NotificationBell({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { open, close, toggle, panelId, containerRef, buttonRef, onKeyDown } = usePopover();
  const unread = useUnreadNotifications(true);
  const notifications = useNotifications(open);
  const markRead = useMarkNotificationsRead();
  const count = unread.data ?? 0;

  return (
    <div ref={containerRef} className={clsx(styles.bell, className)} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.bellButton}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={count > 0 ? t('notifications.bellUnread', { count }) : t('notifications.bell')}
        onClick={toggle}
      >
        <BellIcon weight={count > 0 ? 'fill' : 'regular'} aria-hidden="true" />
        {count > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      <div id={panelId} className={styles.panel} hidden={!open}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>{t('notifications.title')}</h2>
          {count > 0 && (
            <button
              type="button"
              className={styles.textButton}
              disabled={markRead.isPending}
              onClick={() => {
                markRead.mutate({ all: true });
              }}
            >
              {t('notifications.markAll')}
            </button>
          )}
        </div>
        {notifications.isPending && open && <Skeleton shape="block" blockSize="6rem" />}
        {notifications.isSuccess && notifications.data.notifications.length === 0 && (
          <p className={styles.empty}>{t('notifications.empty')}</p>
        )}
        {notifications.isSuccess && (
          <NotificationList
            notifications={notifications.data.notifications.slice(0, 8)}
            onOpen={(notification) => {
              close();
              if (!notification.read) {
                markRead.mutate({ ids: [notification.id] });
              }
            }}
          />
        )}
        <Link to="/app/notifications" className={styles.all} onClick={close}>
          {t('notifications.all')}
        </Link>
      </div>
    </div>
  );
}
