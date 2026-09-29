import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import acuLogo from '../../assets/brand/acu-logo.webp';
import facultyLogo from '../../assets/brand/faculty-logo.webp';
import { ApiStatus } from '../../features/system/ApiStatus';
import { Emblem } from '../brand/Emblem';
import { Container } from './Container';
import { FOOTER_NAV } from './nav-items';
import styles from './SiteFooter.module.css';

export function SiteFooter() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <Container className={styles.top}>
        <div className={styles.identity}>
          <p className={styles.brand}>
            <Emblem size="2rem" />
            {t('brand.name')}
          </p>
          <p className={styles.affiliation}>
            {t('brand.faculty')}
            <br />
            {t('brand.university')}
          </p>
        </div>

        <nav aria-label={t('footer.navLabel')}>
          <ul className={styles.links}>
            {FOOTER_NAV.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className={styles.link}>
                  {t(item.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.logos}>
          <img
            src={acuLogo}
            alt={t('footer.universityLogo')}
            width={116}
            height={48}
            loading="lazy"
            decoding="async"
          />
          <img
            src={facultyLogo}
            alt={t('footer.facultyLogo')}
            width={56}
            height={56}
            loading="lazy"
            decoding="async"
          />
        </div>
      </Container>

      <Container className={styles.bottom}>
        <p>{t('footer.rights', { year })}</p>
        <ApiStatus />
      </Container>
    </footer>
  );
}
