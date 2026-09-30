import type { SessionUser } from '@acu/shared';
import {
  ArrowRightIcon,
  ChartLineUpIcon,
  ClipboardTextIcon,
  SealCheckIcon,
  type Icon,
} from '@phosphor-icons/react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { Container } from '../../components/layout/Container';
import { Badge } from '../../components/ui/Badge';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { Card } from '../../components/ui/Card';
import { useLanguageName } from '../../i18n/use-language-name';
import { PageTitle } from '../../pages/PageTitle';
import { firstName } from '../auth/session';
import { DoctorGroupsSection } from '../groups/DoctorGroupsSection';
import { StudentGroupsCard } from '../groups/StudentGroupsCard';
import { TeachingLanguagesCard } from '../groups/TeachingLanguagesCard';
import { LanguagesCard } from '../languages/LanguagesCard';
import styles from './DashboardPage.module.css';

function UpcomingTool({
  icon: IconComponent,
  title,
  body,
}: {
  icon: Icon;
  title: string;
  body: string;
}) {
  const { t } = useTranslation();
  return (
    <Card className={styles.tool}>
      <span className={styles.toolIcon} aria-hidden="true">
        <IconComponent weight="duotone" />
      </span>
      <div className={styles.toolText}>
        <h3 className={styles.toolTitle}>{title}</h3>
        <p className={styles.muted}>{body}</p>
      </div>
      <Badge tone="neutral">{t('dashboard.soon')}</Badge>
    </Card>
  );
}

function StudentDashboard({ user }: { user: SessionUser }) {
  const { t } = useTranslation();
  const languageName = useLanguageName();
  const student = user.student;
  if (!student) {
    return null;
  }

  return (
    <>
      <p className={styles.lead}>{t('dashboard.student.lead')}</p>

      <div className={styles.summary}>
        <LanguagesCard student={student} />

        <Card className={styles.primaryCard}>
          <h2 className={styles.cardTitle}>{t('dashboard.student.placementTitle')}</h2>
          <p className={styles.muted}>
            {t('dashboard.student.placementBody', {
              language: languageName(student.activeLanguage),
            })}
          </p>
          <ButtonLink
            to="/placement"
            iconEnd={<ArrowRightIcon className="mirror-in-rtl" aria-hidden="true" />}
          >
            {t('dashboard.student.placementCta')}
          </ButtonLink>
        </Card>
      </div>

      <StudentGroupsCard student={student} />

      <section className={styles.section} aria-labelledby="next-steps">
        <h2 id="next-steps" className={styles.sectionTitle}>
          {t('dashboard.student.nextSteps')}
        </h2>
        <div className={styles.tools}>
          <UpcomingTool
            icon={ChartLineUpIcon}
            title={t('dashboard.student.skillsTitle')}
            body={t('dashboard.student.skillsBody')}
          />
        </div>
      </section>
    </>
  );
}

function DoctorDashboard({ user }: { user: SessionUser }) {
  const { t } = useTranslation();
  const doctor = user.doctor;
  if (!doctor) {
    return null;
  }

  return (
    <>
      <p className={styles.lead}>{t('dashboard.doctor.lead')}</p>

      <div className={styles.summary}>
        <Card className={styles.profileCard}>
          <div className={styles.profileHead}>
            <h2 className={styles.cardTitle}>{t('dashboard.doctor.profile')}</h2>
            <Badge tone="success" icon={<SealCheckIcon weight="fill" aria-hidden="true" />}>
              {t('dashboard.doctor.verified')}
            </Badge>
          </div>
          <dl className={styles.facts}>
            <div>
              <dt>{t('dashboard.doctor.staffId')}</dt>
              <dd>
                <span dir="ltr">{doctor.staffId}</span>
              </dd>
            </div>
            <div>
              <dt>{t('dashboard.doctor.universityEmail')}</dt>
              <dd>
                <span dir="ltr">{doctor.universityEmail}</span>
              </dd>
            </div>
          </dl>
        </Card>
        <TeachingLanguagesCard languages={doctor.languages} />
      </div>

      <DoctorGroupsSection languages={doctor.languages} />

      <section className={styles.section} aria-labelledby="doctor-tools">
        <h2 id="doctor-tools" className={styles.sectionTitle}>
          {t('dashboard.doctor.nextTitle')}
        </h2>
        <div className={styles.tools}>
          <UpcomingTool
            icon={ClipboardTextIcon}
            title={t('dashboard.doctor.examsTitle')}
            body={t('dashboard.doctor.examsBody')}
          />
          <UpcomingTool
            icon={ChartLineUpIcon}
            title={t('dashboard.doctor.progressTitle')}
            body={t('dashboard.doctor.progressBody')}
          />
        </div>
      </section>
    </>
  );
}

export function DashboardPage({ user }: { user: SessionUser }) {
  const { t } = useTranslation();
  const { hash } = useLocation();

  // Links such as /app#groups land on their section; #languages focuses its own card.
  useEffect(() => {
    if (hash && hash !== '#languages') {
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
    }
  }, [hash]);
  const displayName =
    user.role === 'doctor' && user.doctor ? user.doctor.displayName : firstName(user.name);

  return (
    <>
      <PageTitle>{t('dashboard.title')}</PageTitle>
      <Container className={styles.page}>
        <header className={styles.header}>
          {user.role && <Badge tone="info">{t(`account.roles.${user.role}`)}</Badge>}
          <h1 className={styles.title}>{t('dashboard.greeting', { name: displayName })}</h1>
        </header>
        {user.role === 'student' && <StudentDashboard user={user} />}
        {user.role === 'doctor' && <DoctorDashboard user={user} />}
        {user.role === 'admin' && <p className={styles.lead}>{t('dashboard.admin.lead')}</p>}
      </Container>
    </>
  );
}
