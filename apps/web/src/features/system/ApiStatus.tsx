import { useTranslation } from 'react-i18next';
import { useApiHealth } from './use-api-health';
import styles from './ApiStatus.module.css';

export function ApiStatus() {
  const { t } = useTranslation();
  const health = useApiHealth();

  return (
    <p className={styles.status} data-state={health.state}>
      <span className={styles.dot} aria-hidden="true" />
      {t(`status.${health.state}`)}
      {health.state === 'online' && (
        <span className={styles.version} dir="ltr">
          v{health.version}
        </span>
      )}
    </p>
  );
}
