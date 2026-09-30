import { formatJoinCode, normalizeJoinCode } from '@acu/shared';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { Container } from '../../components/layout/Container';
import { Alert } from '../../components/ui/Alert';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { PageTitle } from '../../pages/PageTitle';
import { GoogleButton } from '../auth/GoogleButton';
import { googleSignInUrl, landingPathFor, useSession } from '../auth/session';
import { JoinGroupPanel } from './JoinGroupPanel';
import { rememberPendingJoinCode } from './pending-join';
import styles from './Groups.module.css';

/**
 * The page behind a shared join link. A student joins here; anyone else is told what to do first,
 * and the code is kept so joining continues once they have signed in and set up their account.
 */
export function JoinPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const { code: raw = '' } = useParams();
  const code = normalizeJoinCode(raw);
  const user = session.data ?? null;
  const needsLater = code !== null && session.isSuccess && !user?.role;

  useEffect(() => {
    if (needsLater) {
      rememberPendingJoinCode(code);
    }
  }, [needsLater, code]);

  const body = () => {
    if (!code) {
      return <Alert tone="danger">{t('joinPage.invalid')}</Alert>;
    }
    if (session.isPending) {
      return <Spinner size="2rem" />;
    }
    if (!user) {
      return (
        <>
          <p>{t('joinPage.signIn')}</p>
          <GoogleButton href={googleSignInUrl(`/join/${code}`)} />
        </>
      );
    }
    if (!user.role) {
      return (
        <>
          <p>{t('joinPage.setup')}</p>
          <ButtonLink to={landingPathFor(user)}>{t('joinPage.setupCta')}</ButtonLink>
        </>
      );
    }
    if (user.role !== 'student' || !user.student) {
      return <Alert tone="info">{t('joinPage.notStudent')}</Alert>;
    }
    return (
      <JoinGroupPanel
        code={code}
        student={user.student}
        onDone={() => {
          void navigate('/app#my-groups', { replace: true });
        }}
      />
    );
  };

  return (
    <>
      <PageTitle>{t('joinPage.title')}</PageTitle>
      <Container className={styles.joinPage}>
        <Card className={styles.joinCard}>
          <h1 className={styles.cardTitle}>{t('joinPage.title')}</h1>
          {code && (
            <p className={styles.bigCode} dir="ltr">
              {formatJoinCode(code)}
            </p>
          )}
          {body()}
        </Card>
      </Container>
    </>
  );
}
