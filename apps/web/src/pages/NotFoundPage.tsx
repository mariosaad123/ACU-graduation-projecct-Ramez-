import { useTranslation } from 'react-i18next';
import { Container } from '../components/layout/Container';
import { ButtonLink } from '../components/ui/ButtonLink';
import { PageTitle } from './PageTitle';
import styles from './StatusPage.module.css';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageTitle>{t('pages.notFound.title')}</PageTitle>
      <Container className={styles.page}>
        <p className={styles.code} dir="ltr">
          404
        </p>
        <h1 className={styles.title}>{t('pages.notFound.title')}</h1>
        <p className={styles.body}>{t('pages.notFound.body')}</p>
        <ButtonLink to="/">{t('common.backHome')}</ButtonLink>
      </Container>
    </>
  );
}
