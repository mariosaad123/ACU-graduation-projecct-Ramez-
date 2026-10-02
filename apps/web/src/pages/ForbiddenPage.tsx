import { useTranslation } from 'react-i18next';
import { Container } from '../components/layout/Container';
import { ButtonLink } from '../components/ui/ButtonLink';
import { PageTitle } from './PageTitle';
import styles from './StatusPage.module.css';

export function ForbiddenPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageTitle>{t('pages.forbidden.title')}</PageTitle>
      <Container className={styles.page}>
        <p className={styles.code} dir="ltr">
          403
        </p>
        <h1 className={styles.title}>{t('pages.forbidden.title')}</h1>
        <p className={styles.body}>{t('pages.forbidden.body')}</p>
        <ButtonLink to="/app">{t('pages.forbidden.back')}</ButtonLink>
      </Container>
    </>
  );
}
