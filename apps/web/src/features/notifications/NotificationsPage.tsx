import type { NotificationSettings } from '@acu/shared';
import { BellRingingIcon, BellSlashIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Container } from '../../components/layout/Container';
import { Alert } from '../../components/ui/Alert';
import { LoadError } from '../../components/ui/LoadError';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Checkbox } from '../../components/ui/Checkbox';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/toast/toast-context';
import { useLocale } from '../../i18n/use-locale';
import { PageTitle } from '../../pages/PageTitle';
import { describeApiError } from '../auth/api-errors';
import {
  useMarkNotificationsRead,
  useNotificationSettings,
  useNotifications,
  useRefreshNotificationSettings,
  useSaveNotificationSettings,
} from './api';
import { NotificationList } from './NotificationList';
import { disablePush, enablePush, pushState, type PushState } from './push';
import styles from './Notifications.module.css';

const KINDS = ['mentions', 'announcements', 'polls', 'grades', 'assignments', 'messages'] as const;

function PushCard({ available }: { available: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { locale } = useLocale();
  const refresh = useRefreshNotificationSettings();
  const [state, setState] = useState<PushState | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void pushState(available).then((found) => {
      if (!cancelled) {
        setState(found);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [available]);

  const change = async (turnOn: boolean) => {
    setPending(true);
    try {
      const next = turnOn ? await enablePush(locale) : await disablePush();
      setState(next);
      void refresh();
      if (next === 'on') {
        toast({ tone: 'success', title: t('notifications.push.enabled') });
      } else if (next === 'blocked') {
        toast({ tone: 'danger', title: t('notifications.push.states.blocked') });
      }
    } catch (error) {
      toast({ tone: 'danger', title: describeApiError(t, error) });
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className={styles.card}>
      <h2 className={styles.cardTitle}>{t('notifications.push.title')}</h2>
      <p className={styles.muted}>{t('notifications.push.lead')}</p>
      {state === null ? (
        <Skeleton shape="block" blockSize="3rem" />
      ) : state === 'on' ? (
        <div className={styles.pushRow}>
          <p className={styles.pushOn}>
            <BellRingingIcon weight="fill" aria-hidden="true" />
            {t('notifications.push.states.on')}
          </p>
          <Button
            variant="secondary"
            size="sm"
            iconStart={<BellSlashIcon aria-hidden="true" />}
            loading={pending}
            onClick={() => {
              void change(false);
            }}
          >
            {t('notifications.push.disable')}
          </Button>
        </div>
      ) : state === 'off' ? (
        <div className={styles.pushRow}>
          <p className={styles.muted}>{t('notifications.push.states.off')}</p>
          <Button
            iconStart={<BellRingingIcon aria-hidden="true" />}
            loading={pending}
            onClick={() => {
              void change(true);
            }}
          >
            {t('notifications.push.enable')}
          </Button>
        </div>
      ) : (
        <Alert tone={state === 'blocked' ? 'warning' : 'info'}>
          {t(`notifications.push.states.${state}`)}
        </Alert>
      )}
    </Card>
  );
}

/** Everything someone was told, and what they want to be told about on this browser. */
export function NotificationsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const notifications = useNotifications();
  const settings = useNotificationSettings();
  const save = useSaveNotificationSettings();
  const markRead = useMarkNotificationsRead();

  const toggle = (current: NotificationSettings, kind: (typeof KINDS)[number], on: boolean) => {
    save.mutate(
      { ...current, [kind]: on },
      {
        onError: (error) => {
          toast({ tone: 'danger', title: describeApiError(t, error) });
        },
      },
    );
  };

  return (
    <>
      <PageTitle>{t('notifications.title')}</PageTitle>
      <Container className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t('notifications.title')}</h1>
          <p className={styles.lead}>{t('notifications.lead')}</p>
        </header>

        <div className={styles.columns}>
          <Card className={styles.card}>
            <div className={styles.panelHead}>
              <h2 className={styles.cardTitle}>{t('notifications.latest')}</h2>
              {(notifications.data?.unread ?? 0) > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={markRead.isPending}
                  onClick={() => {
                    markRead.mutate({ all: true });
                  }}
                >
                  {t('notifications.markAll')}
                </Button>
              )}
            </div>
            {notifications.isPending && <Skeleton shape="block" blockSize="10rem" />}
            {notifications.isError && (
              <LoadError
                error={notifications.error}
                retrying={notifications.isFetching}
                onRetry={() => {
                  void notifications.refetch();
                }}
              />
            )}
            {notifications.isSuccess &&
              (notifications.data.notifications.length === 0 ? (
                <p className={styles.empty}>{t('notifications.empty')}</p>
              ) : (
                <NotificationList
                  notifications={notifications.data.notifications}
                  onOpen={(notification) => {
                    if (!notification.read) {
                      markRead.mutate({ ids: [notification.id] });
                    }
                  }}
                />
              ))}
          </Card>

          <div className={styles.side}>
            {settings.isPending && <Skeleton shape="block" blockSize="12rem" />}
            {settings.isError && (
              <LoadError
                error={settings.error}
                retrying={settings.isFetching}
                onRetry={() => {
                  void settings.refetch();
                }}
              />
            )}
            {settings.isSuccess && (
              <>
                <PushCard available={settings.data.push.available} />
                <Card className={styles.card}>
                  <h2 className={styles.cardTitle}>{t('notifications.settings.title')}</h2>
                  <p className={styles.muted}>{t('notifications.settings.lead')}</p>
                  {KINDS.map((kind) => (
                    <Checkbox
                      key={kind}
                      label={t(`notifications.settings.${kind}`)}
                      hint={
                        kind === 'messages' ? t('notifications.settings.messagesHint') : undefined
                      }
                      checked={settings.data.settings[kind]}
                      disabled={save.isPending}
                      onChange={(event) => {
                        toggle(settings.data.settings, kind, event.target.checked);
                      }}
                    />
                  ))}
                </Card>
              </>
            )}
          </div>
        </div>
      </Container>
    </>
  );
}
