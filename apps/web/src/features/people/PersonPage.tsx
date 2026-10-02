import { LANGUAGES } from '@acu/shared';
import { ArrowRightIcon, EnvelopeSimpleIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { LanguageGlyph } from '../../components/language/LanguageGlyph';
import { Container } from '../../components/layout/Container';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { useFormatDate } from '../../i18n/use-format-date';
import { useLanguageName } from '../../i18n/use-language-name';
import { ApiError } from '../../lib/api';
import { NotFoundPage } from '../../pages/NotFoundPage';
import { PageTitle } from '../../pages/PageTitle';
import { describeApiError } from '../auth/api-errors';
import { Avatar } from '../auth/Avatar';
import { GroupPhoto } from '../groups/GroupPhoto';
import { usePerson } from './api';
import styles from './PersonPage.module.css';

/** Someone's profile, as the people who share a group with them see it. */
export function PersonPage() {
  const { t } = useTranslation();
  const languageName = useLanguageName();
  const formatDate = useFormatDate();
  const navigate = useNavigate();
  const location = useLocation();
  const { personId = '' } = useParams();
  const person = usePerson(personId);

  if (person.isPending) {
    return (
      <Container className={styles.page}>
        <Spinner size="2.5rem" />
      </Container>
    );
  }
  if (person.isError) {
    if (person.error instanceof ApiError && person.error.status === 404) {
      return <NotFoundPage />;
    }
    return (
      <Container className={styles.page}>
        <Alert tone="danger" live>
          {describeApiError(t, person.error)}
        </Alert>
      </Container>
    );
  }
  const profile = person.data;
  const isDoctor = profile.role === 'doctor';
  // Opened from somewhere in the app: go back there. Opened directly: go to the dashboard.
  const cameFromApp = location.key !== 'default';

  return (
    <>
      <PageTitle>{profile.name}</PageTitle>
      <Container className={styles.page}>
        {cameFromApp ? (
          <button
            type="button"
            className={styles.back}
            onClick={() => {
              void navigate(-1);
            }}
          >
            <ArrowRightIcon className="mirror-in-rtl" aria-hidden="true" />
            {t('person.back')}
          </button>
        ) : (
          <Link to="/app" className={styles.back}>
            <ArrowRightIcon className="mirror-in-rtl" aria-hidden="true" />
            {t('person.back')}
          </Link>
        )}

        <header className={styles.header}>
          <Avatar user={profile} size="6rem" />
          <div className={styles.identity}>
            <h1 className={styles.name}>{profile.name}</h1>
            <p className={styles.badges}>
              <Badge tone={isDoctor ? 'emblem' : 'info'}>
                {isDoctor ? t('person.doctor') : t('person.student')}
              </Badge>
              <span className={styles.muted}>
                {t('person.memberSince', { date: formatDate(profile.memberSince) })}
              </span>
            </p>
            {profile.email && (
              <a href={`mailto:${profile.email}`} className={styles.email}>
                <EnvelopeSimpleIcon aria-hidden="true" />
                <span dir="ltr">{profile.email}</span>
              </a>
            )}
          </div>
        </header>

        {profile.me && (
          <Alert tone="info">
            <span className={styles.mine}>
              {t('person.yours')}
              <ButtonLink
                to="/app/profile"
                size="sm"
                variant="secondary"
                iconStart={<PencilSimpleIcon aria-hidden="true" />}
              >
                {t('person.editYours')}
              </ButtonLink>
            </span>
          </Alert>
        )}

        <div className={styles.cards}>
          <Card className={styles.card}>
            <h2 className={styles.cardTitle}>
              {isDoctor ? t('person.teaches') : t('person.learns')}
            </h2>
            <ul className={styles.languages}>
              {profile.languages.map((language) => (
                <li key={language} className={styles.language}>
                  <LanguageGlyph
                    language={language}
                    size="sm"
                    active={language === profile.activeLanguage}
                  />
                  <span>
                    {languageName(language)}{' '}
                    <span
                      className={styles.muted}
                      lang={language}
                      dir={LANGUAGES[language].direction}
                    >
                      {LANGUAGES[language].nativeName}
                    </span>
                  </span>
                  {language === profile.activeLanguage && (
                    <Badge tone="emblem">{t('person.learningNow')}</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          {!profile.me && (
            <Card className={styles.card}>
              <h2 className={styles.cardTitle}>{t('person.sharedGroups')}</h2>
              {profile.sharedGroups.length === 0 ? (
                <p className={styles.muted}>{t('person.noSharedGroups')}</p>
              ) : (
                <ul className={styles.groups}>
                  {profile.sharedGroups.map((group) => (
                    <li key={group.id}>
                      <Link to={`/app/groups/${group.id}`} className={styles.groupLink}>
                        <GroupPhoto photoUrl={group.photoUrl} language={group.language} size="sm" />
                        <span>{group.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </Container>
    </>
  );
}
