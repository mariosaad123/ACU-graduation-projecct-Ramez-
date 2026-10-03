import { WifiSlashIcon } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../ui/toast/toast-context';
import styles from './ConnectionBanner.module.css';

/**
 * Says so when the device goes offline, instead of letting every action fail one by one. When the
 * connection returns, whatever is on screen is fetched again and the reader is told.
 */
export function ConnectionBanner() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const lost = () => {
      setOffline(true);
    };
    const back = () => {
      setOffline(false);
      toast({ tone: 'success', title: t('connection.back') });
      void queryClient.invalidateQueries();
    };
    window.addEventListener('offline', lost);
    window.addEventListener('online', back);
    return () => {
      window.removeEventListener('offline', lost);
      window.removeEventListener('online', back);
    };
  }, [queryClient, t, toast]);

  if (!offline) {
    return null;
  }
  return (
    <p className={styles.banner} role="status">
      <WifiSlashIcon aria-hidden="true" />
      {t('connection.offline')}
    </p>
  );
}
