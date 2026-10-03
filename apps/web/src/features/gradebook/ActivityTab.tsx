import type { GradebookStudent, GroupView } from '@acu/shared';
import { MicrosoftExcelLogoIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useLocale } from '../../i18n/use-locale';
import { describeApiError } from '../auth/api-errors';
import { Avatar } from '../auth/Avatar';
import { useGradebook } from './api';
import { ExportDialog } from './ExportDialog';
import styles from './Gradebook.module.css';

type Filter = 'all' | 'active' | 'quiet' | 'away';

function stateOf(student: GradebookStudent): Exclude<Filter, 'all'> {
  if (student.activity.away) {
    return 'away';
  }
  return student.activity.quiet ? 'quiet' : 'active';
}

/** "3 days ago", "yesterday", in the interface language; a dash when it never happened. */
function useRelativeTime() {
  const { intlLocale } = useLocale();
  return useMemo(() => {
    const format = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' });
    return (iso: string | null) => {
      if (!iso) {
        return '—';
      }
      const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
      if (Math.abs(minutes) < 60) {
        return format.format(minutes, 'minute');
      }
      const hours = Math.round(minutes / 60);
      if (Math.abs(hours) < 24) {
        return format.format(hours, 'hour');
      }
      return format.format(Math.round(hours / 24), 'day');
    };
  }, [intlLocale]);
}

/** Who takes part and who has gone quiet, so the doctor can reach out before it is too late. */
export function ActivityTab({ view }: { view: GroupView }) {
  const { t } = useTranslation();
  const relative = useRelativeTime();
  const gradebook = useGradebook(view.id);
  const [filter, setFilter] = useState<Filter>('all');
  const [exporting, setExporting] = useState(false);

  if (gradebook.isPending) {
    return <Skeleton shape="block" blockSize="16rem" />;
  }
  if (gradebook.isError) {
    return (
      <Alert tone="danger" live>
        {describeApiError(t, gradebook.error)}
      </Alert>
    );
  }
  const { totals } = gradebook.data;
  const students = gradebook.data.students.filter((student) => student.status === 'active');
  const counts = {
    all: students.length,
    active: students.filter((student) => stateOf(student) === 'active').length,
    quiet: students.filter((student) => stateOf(student) === 'quiet').length,
    away: students.filter((student) => stateOf(student) === 'away').length,
  };
  // Those who need attention first, then the most active.
  const order = { away: 0, quiet: 1, active: 2 };
  const shown = students
    .filter((student) => filter === 'all' || stateOf(student) === filter)
    .sort(
      (a, b) =>
        order[stateOf(a)] - order[stateOf(b)] ||
        b.activity.messagesThisWeek - a.activity.messagesThisWeek ||
        a.name.localeCompare(b.name),
    );

  return (
    <section className={styles.tab} aria-labelledby={`activity-${view.id}`}>
      <header className={styles.head}>
        <div>
          <h2 id={`activity-${view.id}`} className={styles.title}>
            {t('activity.title')}
          </h2>
          <p className={styles.muted}>{t('activity.lead')}</p>
        </div>
        <Button
          variant="secondary"
          iconStart={<MicrosoftExcelLogoIcon aria-hidden="true" />}
          onClick={() => {
            setExporting(true);
          }}
        >
          {t('grades.export')}
        </Button>
      </header>

      <div className={styles.filters} role="group" aria-label={t('activity.filter')}>
        {(['all', 'active', 'quiet', 'away'] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            className={styles.filter}
            data-state={entry}
            aria-pressed={filter === entry}
            onClick={() => {
              setFilter(entry);
            }}
          >
            <span className={styles.filterCount}>{counts[entry]}</span>
            <span>{t(`activity.states.${entry}`)}</span>
            <span className={styles.columnMeta}>{t(`activity.stateHints.${entry}`)}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className={styles.empty}>
          {students.length === 0 ? t('grades.noStudents') : t('activity.none')}
        </p>
      ) : (
        <ul className={styles.activityList}>
          {shown.map((student) => {
            const { activity } = student;
            const state = stateOf(student);
            return (
              <li key={student.id} className={styles.activityItem}>
                <Link to={`/app/people/${student.id}`} className={styles.student}>
                  <Avatar user={student} size="2.5rem" />
                  <span className={styles.studentText}>
                    <span className={styles.studentName}>{student.name}</span>
                    <span className={styles.columnMeta}>
                      {t('activity.lastSeen', { when: relative(activity.lastSeenAt) })}
                    </span>
                  </span>
                </Link>
                <span className={styles.state} data-state={state}>
                  {t(`activity.states.${state}`)}
                </span>
                <dl className={styles.activityFacts}>
                  <div>
                    <dt>{t('activity.messages')}</dt>
                    <dd>
                      {activity.messages}
                      <span className={styles.columnMeta}>
                        {t('activity.thisWeek', { count: activity.messagesThisWeek })}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>{t('activity.lastMessage')}</dt>
                    <dd>{relative(activity.lastMessageAt)}</dd>
                  </div>
                  <div>
                    <dt>{t('activity.announcements')}</dt>
                    <dd>
                      {activity.announcementsRead} / {totals.announcements}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('activity.polls')}</dt>
                    <dd>
                      {activity.pollsAnswered} / {totals.polls}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('activity.files')}</dt>
                    <dd>{activity.filesShared}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}

      {exporting && (
        <ExportDialog
          groupId={view.id}
          onClose={() => {
            setExporting(false);
          }}
        />
      )}
    </section>
  );
}
