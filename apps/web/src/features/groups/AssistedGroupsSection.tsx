import { ArrowRightIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/Badge';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { Card } from '../../components/ui/Card';
import { useLanguageName } from '../../i18n/use-language-name';
import { useAssistedGroups } from './api';
import { GroupPhoto } from './GroupPhoto';
import styles from './Groups.module.css';

/** Groups a doctor helps run as a teaching assistant. Nothing shows until there is one. */
export function AssistedGroupsSection() {
  const { t } = useTranslation();
  const languageName = useLanguageName();
  const groups = useAssistedGroups();

  if (!groups.data || groups.data.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} aria-labelledby="assisted-groups" id="assisting">
      <div>
        <h2 id="assisted-groups" className={styles.sectionTitle}>
          {t('assisting.title')}
        </h2>
        <p className={styles.muted}>{t('assisting.lead')}</p>
      </div>
      <div className={styles.groupGrid}>
        {groups.data.map((group) => (
          <Card key={group.id} className={styles.groupCard} data-archived={group.archived}>
            <div className={styles.groupHead}>
              <GroupPhoto
                photoUrl={group.photoUrl}
                language={group.language}
                active={!group.archived}
              />
              <div className={styles.groupTitle}>
                <h3 className={styles.groupName}>{group.name}</h3>
                <p className={styles.muted}>
                  {languageName(group.language)} · {group.doctorName}
                </p>
              </div>
            </div>
            <p className={styles.stats}>
              <span>{t('groups.students', { count: group.students })}</span>
              {group.unread > 0 && (
                <Badge tone="emblem">{t('groups.unread', { count: group.unread })}</Badge>
              )}
              {group.archived && <Badge>{t('groups.archived')}</Badge>}
            </p>
            <ButtonLink
              to={`/app/groups/${group.id}`}
              variant="secondary"
              aria-label={t('myGroups.openGroup', { name: group.name })}
              iconEnd={<ArrowRightIcon className="mirror-in-rtl" aria-hidden="true" />}
            >
              {t('myGroups.enter')}
            </ButtonLink>
          </Card>
        ))}
      </div>
    </section>
  );
}
