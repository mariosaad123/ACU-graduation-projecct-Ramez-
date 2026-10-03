import { bandOf, totalPercent, type GroupView } from '@acu/shared';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/ui/Alert';
import { Skeleton } from '../../components/ui/Skeleton';
import { useFormatDate } from '../../i18n/use-format-date';
import { describeApiError } from '../auth/api-errors';
import { useMyGrades } from './api';
import styles from './Gradebook.module.css';

/** A student's own grades in a group: what the doctor published, and where the class stands. */
export function MyGradesTab({ view }: { view: GroupView }) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const grades = useMyGrades(view.id);

  if (grades.isPending) {
    return <Skeleton shape="block" blockSize="12rem" />;
  }
  if (grades.isError) {
    return (
      <Alert tone="danger" live>
        {describeApiError(t, grades.error)}
      </Alert>
    );
  }
  const { columns } = grades.data;
  const total = totalPercent(columns, (id) => {
    const grade = columns.find((column) => column.id === id)?.grade;
    return grade ?? undefined;
  });
  const band = total === null ? null : bandOf(total);

  return (
    <section className={styles.tab} aria-labelledby={`my-grades-${view.id}`}>
      <header className={styles.head}>
        <div>
          <h2 id={`my-grades-${view.id}`} className={styles.title}>
            {t('myGrades.title')}
          </h2>
          <p className={styles.muted}>{t('myGrades.lead')}</p>
        </div>
        {total !== null && band && (
          <p className={styles.myTotal}>
            <span className={styles.myTotalValue}>{total.toFixed(1)}%</span>
            <span className={styles.band} data-band={band}>
              {t(`grades.bands.${band}`)}
            </span>
          </p>
        )}
      </header>

      {columns.length === 0 ? (
        <p className={styles.empty}>{t('myGrades.empty')}</p>
      ) : (
        <ul className={styles.myList}>
          {columns.map((column) => {
            const { grade } = column;
            const scored = grade?.status === 'scored' && grade.score !== null;
            return (
              <li key={column.id} className={styles.myItem}>
                <div className={styles.myItemText}>
                  <p className={styles.studentName} dir="auto">
                    {column.title}
                  </p>
                  <p className={styles.columnMeta}>
                    {t(`grades.kinds.${column.kind}`)}
                    {column.heldOn && ` · ${formatDate(column.heldOn)}`}
                    {column.weight !== null &&
                      ` · ${t('grades.weightOf', { weight: column.weight })}`}
                  </p>
                  {grade?.note && (
                    <p className={styles.myNote} dir="auto">
                      {grade.note}
                    </p>
                  )}
                </div>
                <div className={styles.myScore}>
                  {scored ? (
                    <p className={styles.myScoreValue} dir="ltr">
                      {grade.score} <span>/ {column.maxScore}</span>
                    </p>
                  ) : (
                    <p className={styles.myScoreState} data-status={grade?.status ?? 'none'}>
                      {grade?.status === 'absent'
                        ? t('grades.statusAbsent')
                        : grade?.status === 'excused'
                          ? t('grades.statusExcused')
                          : t('myGrades.notYet')}
                    </p>
                  )}
                  {column.average !== null && (
                    <p className={styles.columnMeta}>
                      {t('myGrades.classAverage', { average: column.average.toFixed(1) })}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
