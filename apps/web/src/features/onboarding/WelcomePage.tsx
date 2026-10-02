import type { SessionUser } from '@acu/shared';
import {
  ArrowRightIcon,
  ChalkboardTeacherIcon,
  GraduationCapIcon,
  KeyIcon,
  type Icon,
} from '@phosphor-icons/react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Container } from '../../components/layout/Container';
import { PageTitle } from '../../pages/PageTitle';
import { firstName } from '../auth/session';
import { SetupHeader } from './SetupHeader';
import styles from './Onboarding.module.css';

interface RoleCardProps {
  to: string;
  icon: Icon;
  title: string;
  body: string;
  note?: string;
  cta: string;
  tone: 'student' | 'doctor';
}

function RoleCard({ to, icon: IconComponent, title, body, note, cta, tone }: RoleCardProps) {
  return (
    <Link to={to} className={styles.roleCard} data-tone={tone}>
      <span className={styles.roleIcon} aria-hidden="true">
        <IconComponent weight="duotone" />
      </span>
      <span className={styles.roleTitle}>{title}</span>
      <span className={styles.roleBody}>{body}</span>
      {note && (
        <span className={styles.roleNote}>
          <KeyIcon aria-hidden="true" />
          {note}
        </span>
      )}
      <span className={styles.roleCta}>
        {cta}
        <ArrowRightIcon className={clsx(styles.ctaIcon, 'mirror-in-rtl')} aria-hidden="true" />
      </span>
    </Link>
  );
}

export function WelcomePage({ user }: { user: SessionUser }) {
  const { t } = useTranslation();

  return (
    <>
      <PageTitle>{t('account.completeSetup')}</PageTitle>
      <Container className={styles.page}>
        <SetupHeader
          step={1}
          total={2}
          title={t('welcome.title', { name: firstName(user.name) })}
          lead={t('welcome.lead')}
        />
        <div className={styles.roles}>
          <RoleCard
            to="/welcome/student"
            icon={GraduationCapIcon}
            title={t('welcome.student.title')}
            body={t('welcome.student.body')}
            cta={t('welcome.student.cta')}
            tone="student"
          />
          <RoleCard
            to="/welcome/doctor"
            icon={ChalkboardTeacherIcon}
            title={t('welcome.doctor.title')}
            body={t('welcome.doctor.body')}
            note={t('welcome.doctor.note')}
            cta={t('welcome.doctor.cta')}
            tone="doctor"
          />
        </div>
      </Container>
    </>
  );
}
