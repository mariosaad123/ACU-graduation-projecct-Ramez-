import { LANGUAGES } from '@acu/shared';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Container } from '../../components/layout/Container';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { useLanguageName } from '../../i18n/use-language-name';
import { ApiError } from '../../lib/api';
import { NotFoundPage } from '../../pages/NotFoundPage';
import { PageTitle } from '../../pages/PageTitle';
import { describeApiError } from '../auth/api-errors';
import { Avatar } from '../auth/Avatar';
import { GroupChat } from '../chat/GroupChat';
import { useGroupView } from '../chat/use-chat';
import { GroupPeople } from '../people/GroupPeople';
import { GroupPhoto } from './GroupPhoto';
import styles from './Groups.module.css';

/** A group as one of its students sees it: who teaches it, and its chat. */
export function StudentGroupPage() {
  const { t } = useTranslation();
  const languageName = useLanguageName();
  const { groupId = '' } = useParams();
  const view = useGroupView(groupId);

  if (view.isPending) {
    return (
      <Container className={styles.page}>
        <Spinner size="2.5rem" />
      </Container>
    );
  }
  if (view.isError) {
    // Not a member (any more), or a group that does not exist: the same page either way.
    if (view.error instanceof ApiError && view.error.status === 404) {
      return <NotFoundPage />;
    }
    return (
      <Container className={styles.page}>
        <Alert tone="danger" live>
          {describeApiError(t, view.error)}
        </Alert>
      </Container>
    );
  }
  const group = view.data;

  return (
    <>
      <PageTitle>{group.name}</PageTitle>
      <Container className={styles.page}>
        <Link to="/app#my-groups" className={styles.back}>
          <ArrowRightIcon className="mirror-in-rtl" aria-hidden="true" />
          {t('myGroups.back')}
        </Link>

        <header className={styles.pageHead}>
          <GroupPhoto photoUrl={group.photoUrl} language={group.language} size="lg" active />
          <div className={styles.pageTitleBlock}>
            <h1 className={styles.pageTitle}>{group.name}</h1>
            <p className={styles.muted}>
              {languageName(group.language)}{' '}
              <span lang={group.language} dir={LANGUAGES[group.language].direction}>
                ({LANGUAGES[group.language].nativeName})
              </span>
            </p>
            {group.description && <p>{group.description}</p>}
            <p className={styles.person}>
              <Avatar
                user={{ name: group.doctor.name, avatarUrl: group.doctor.avatarUrl }}
                size="2rem"
              />
              <span>{group.doctor.name}</span>
              <Badge tone="emblem">{t('chat.doctor')}</Badge>
            </p>
          </div>
        </header>

        <div className={styles.groupLayout}>
          <GroupChat view={group} />
          <GroupPeople groupId={group.id} />
        </div>
      </Container>
    </>
  );
}
