import { useTranslation } from 'react-i18next';
import { ApertureMark } from '../components/brand/ApertureMark';
import { Container } from '../components/layout/Container';
import { ButtonLink } from '../components/ui/ButtonLink';
import { PageTitle } from './PageTitle';
import styles from './StatusPage.module.css';

/** Stands in for sections that are planned but not built yet, so no navigation link is broken. */
export function PlaceholderPage({ section }: { section: string }) {
  const { t } = useTranslation();

  return (
    <>
      <PageTitle>{section}</PageTitle>
      <Container className={styles.page}>
        <ApertureMark size="4rem" />
        <p className={styles.eyebrow}>{section}</p>
        <h1 className={styles.title}>{t('pages.placeholder.title')}</h1>
        <p className={styles.body}>{t('pages.placeholder.body', { section })}</p>
        <ButtonLink to="/" variant="secondary">
          {t('common.backHome')}
        </ButtonLink>
      </Container>
    </>
  );
}
