import { useTranslation } from 'react-i18next';
import styles from './SkipLink.module.css';

export const MAIN_CONTENT_ID = 'main-content';

export function SkipLink() {
  const { t } = useTranslation();
  return (
    <a className={styles.skipLink} href={`#${MAIN_CONTENT_ID}`}>
      {t('nav.skipToContent')}
    </a>
  );
}
