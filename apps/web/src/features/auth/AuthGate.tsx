import type { SessionUser, UserRole } from '@acu/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router';
import { Container } from '../../components/layout/Container';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { ForbiddenPage } from '../../pages/ForbiddenPage';
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
    return (
      <div className={styles.loading}>
        <Spinner size="4rem" />
      </div>
    );
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
  return rule.roles.includes(user.role) ? children(user) : <ForbiddenPage />;
}
