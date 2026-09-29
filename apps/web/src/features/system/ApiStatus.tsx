import type { ApiHealth } from './use-api-health';
import styles from './ApiStatus.module.css';

const LABELS: Record<ApiHealth['state'], string> = {
  checking: 'Checking API…',
  online: 'API online',
  offline: 'API unreachable',
};

export function ApiStatus({ health }: { health: ApiHealth }) {
  return (
    <p className={styles.status} data-state={health.state} role="status">
      <span className={styles.dot} aria-hidden="true" />
      {LABELS[health.state]}
      {health.state === 'online' && <span className={styles.version}>v{health.version}</span>}
    </p>
  );
}
