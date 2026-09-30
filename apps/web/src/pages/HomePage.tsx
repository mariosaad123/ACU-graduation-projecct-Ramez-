import type { LearningLanguage } from '@acu/shared';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguagePicker } from '../components/language/LanguagePicker';
import { LanguageSpotlight } from '../components/language/LanguageSpotlight';
import { Container } from '../components/layout/Container';
import { ButtonLink } from '../components/ui/ButtonLink';
import { PageTitle } from './PageTitle';
import styles from './HomePage.module.css';

export function HomePage() {
  const { t } = useTranslation();
  const [language, setLanguage] = useState<LearningLanguage>('en');

  return (
    <>
      <PageTitle />
      <Container className={styles.hero}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{t('pages.home.eyebrow')}</p>
          <h1 className={styles.title}>{t('pages.home.title')}</h1>
          <p className={styles.lead}>{t('pages.home.lead')}</p>
          <div className={styles.actions}>
            <ButtonLink
              to="/placement"
              size="lg"
              iconEnd={<ArrowRightIcon className="mirror-in-rtl" aria-hidden="true" />}
            >
              {t('pages.home.start')}
            </ButtonLink>
            <ButtonLink to="/skills" size="lg" variant="secondary">
              {t('pages.home.explore')}
            </ButtonLink>
          </div>
        </div>
        <div className={styles.languages}>
          <LanguagePicker value={language} onChange={setLanguage} />
          <LanguageSpotlight language={language} />
        </div>
      </Container>
    </>
  );
}
