import { isRouteErrorResponse, useRouteError } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Container } from '../components/layout/Container';
import { Button } from '../components/ui/Button';
import { NotFoundPage } from './NotFoundPage';
import { PageTitle } from './PageTitle';
import styles from './StatusPage.module.css';

export function RouteErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  return (
    <>
      <PageTitle>{t('pages.error.title')}</PageTitle>
      <Container className={styles.page}>
        <h1 className={styles.title}>{t('pages.error.title')}</h1>
        <p className={styles.body}>{t('pages.error.body')}</p>
        <Button
          onClick={() => {
            window.location.reload();
          }}
        >
          {t('pages.error.reload')}
        </Button>
      </Container>
    </>
  );
}
