import { ApiStatus } from '../features/system/ApiStatus';
import { useApiHealth } from '../features/system/use-api-health';
import styles from './App.module.css';

export function App() {
  const health = useApiHealth();

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>ACU Language Platform</h1>
      <p className={styles.subtitle}>
        Faculty of Languages and Translation · Ahram Canadian University
      </p>
      <ApiStatus health={health} />
    </main>
  );
}
