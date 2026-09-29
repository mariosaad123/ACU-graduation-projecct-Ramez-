import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApertureMark } from './ApertureMark';
import styles from './BrandLockup.module.css';

export function BrandLockup() {
  const { t } = useTranslation();

  return (
    <Link to="/" className={styles.lockup} aria-label={t('brand.homeLink')}>
      <ApertureMark size="2.25rem" />
      <span className={styles.text}>
        <span className={styles.name}>{t('brand.name')}</span>
        <span className={styles.faculty}>{t('brand.faculty')}</span>
      </span>
    </Link>
  );
}
