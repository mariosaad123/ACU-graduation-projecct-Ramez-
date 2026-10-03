import { isStaff } from '@acu/shared';
import { ChalkboardTeacherIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LoadError } from '../../components/ui/LoadError';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { Avatar } from '../auth/Avatar';
import { useGroupPeople } from './api';
import styles from './People.module.css';

/** How many people show before "show all", so a big class does not push the chat away. */
const FIRST_PEOPLE = 12;

/** Everyone in a group: its doctor, then the students. Each opens that person's profile. */
export function GroupPeople({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const people = useGroupPeople(groupId);
  const [all, setAll] = useState(false);

  if (people.isPending) {
    return (
      <div className={styles.panel} aria-busy="true">
        <Skeleton shape="block" blockSize="12rem" />
      </div>
    );
  }
  if (people.isError) {
    return (
      <LoadError
        error={people.error}
        retrying={people.isFetching}
        onRetry={() => {
          void people.refetch();
        }}
      />
    );
  }

  const shown = all ? people.data : people.data.slice(0, FIRST_PEOPLE);
  const students = people.data.filter((person) => person.role === 'student').length;

  return (
    <section className={styles.panel} aria-labelledby={`people-${groupId}`}>
      <h2 id={`people-${groupId}`} className={styles.panelTitle}>
        {t('people.count', { count: people.data.length })}
      </h2>
      <ul className={styles.people}>
        {shown.map((person) => (
          <li key={person.id}>
            <Link to={`/app/people/${person.id}`} className={styles.personLink}>
              <Avatar user={person} size="2.25rem" />
              <span className={styles.personName}>{person.name}</span>
              {person.role !== 'student' && (
                <Badge
                  tone={isStaff(person.role) ? 'emblem' : 'info'}
                  icon={
                    person.role === 'owner' ? (
                      <ChalkboardTeacherIcon aria-hidden="true" />
                    ) : undefined
                  }
                >
                  {t(`roles.${person.role}`)}
                </Badge>
              )}
              {person.me && <Badge>{t('people.you')}</Badge>}
            </Link>
          </li>
        ))}
      </ul>
      {students === 0 && <p className={styles.muted}>{t('people.empty')}</p>}
      {people.data.length > FIRST_PEOPLE && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setAll((value) => !value);
          }}
        >
          {all ? t('people.showLess') : t('people.showAll', { count: people.data.length })}
        </Button>
      )}
    </section>
  );
}
