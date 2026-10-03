import { useState } from 'react';
import { CheckCircleIcon } from '@phosphor-icons/react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Emblem } from '../../components/brand/Emblem';
import { Container } from '../../components/layout/Container';
import { Alert } from '../../components/ui/Alert';
import { PageTitle } from '../../pages/PageTitle';
import { GoogleButton } from './GoogleButton';
import { googleSignInUrl, takeSessionEnded } from './session';
import styles from './SignInPage.module.css';

const FAILURES = [
  'google_unavailable',
  'expired',
  'cancelled',
  'failed',
  'unverified_email',
  'disabled',
] as const;
type Failure = (typeof FAILURES)[number];

const isFailure = (value: string | null): value is Failure =>
  value !== null && (FAILURES as readonly string[]).includes(value);

const HIGHLIGHTS = ['placement', 'practice', 'doctors'] as const;

export function SignInPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const failure = params.get('error');
  const returnTo = params.get('returnTo');
  // Read once: the explanation should not come back after a reload.
  const [ended] = useState(takeSessionEnded);

  return (
    <>
      <PageTitle>{t('auth.signInTitle')}</PageTitle>
      <Container className={styles.page}>
        <section className={styles.intro} aria-labelledby="sign-in-heading">
          <Emblem size="5.5rem" />
          <h1 id="sign-in-heading" className={styles.heading}>
            {t('auth.signInHeading')}
          </h1>
          <p className={styles.lead}>{t('auth.signInLead')}</p>
          <ul className={styles.highlights}>
            {HIGHLIGHTS.map((key) => (
              <li key={key}>
                <CheckCircleIcon weight="fill" aria-hidden="true" />
                {t(`auth.highlights.${key}`)}
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.card} aria-label={t('auth.signInTitle')}>
          <h2 className={styles.cardTitle}>{t('auth.signInTitle')}</h2>
          {ended && !isFailure(failure) && <Alert tone="info">{t('auth.sessionEnded')}</Alert>}
          {isFailure(failure) && (
            <Alert tone={failure === 'cancelled' ? 'info' : 'danger'} live>
              {t(`auth.failures.${failure}`)}
            </Alert>
          )}
          <GoogleButton href={googleSignInUrl(returnTo)} />
          <p className={styles.hint}>{t('auth.googleHint')}</p>
          <p className={styles.legal}>
            <Trans
              i18nKey="auth.privacy"
              components={{ terms: <Link to="/terms" />, privacy: <Link to="/privacy" /> }}
            />
          </p>
        </section>
      </Container>
    </>
  );
}
