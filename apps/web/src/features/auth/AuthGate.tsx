import type { SessionUser, UserRole } from '@acu/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router';
import { SplashScreen } from '../../components/brand/SplashScreen';
import { Container } from '../../components/layout/Container';
import { Alert } from '../../components/ui/Alert';
import { ForbiddenPage } from '../../pages/ForbiddenPage';
import { UniversityIdStep } from '../profile/UniversityIdStep';
import { landingPathFor, useSession } from './session';
import styles from './AuthGate.module.css';

type GateRule =
  /** Visitors only, such as the sign-in page. */
  | { kind: 'visitor' }
  /** Signed in but not set up yet: the role choice and setup steps. */
  | { kind: 'setup' }
  /** Signed in with one of these roles. */
  | { kind: 'role'; roles: readonly UserRole[] };

interface AuthGateProps {
  rule: GateRule;
  children: (user: SessionUser | null) => ReactNode;
}

export function AuthGate({ rule, children }: AuthGateProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const session = useSession();

  if (session.isPending) {
    return <SplashScreen />;
  }

  if (session.isError) {
    return (
      <Container className={styles.error}>
        <Alert tone="danger" title={t('auth.sessionErrorTitle')}>
          {t('auth.sessionErrorBody')}
        </Alert>
      </Container>
    );
  }

  const user = session.data;

  if (rule.kind === 'visitor') {
    return user ? <Navigate to={landingPathFor(user)} replace /> : children(null);
  }

  if (!user) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  if (rule.kind === 'setup') {
    return user.role ? <Navigate to="/app" replace /> : children(user);
  }

  if (!user.role) {
    return <Navigate to={landingPathFor(user)} replace />;
  }
  if (!rule.roles.includes(user.role)) {
    return <ForbiddenPage />;
  }
  if (user.role === 'student' && user.student && !user.student.universityId) {
    return <UniversityIdStep />;
  }
  return children(user);
}
