import type { GradeColumn, GradeInput, GradebookStudent } from '@acu/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import fieldStyles from '../../components/ui/Field.module.css';
import { TextArea } from '../../components/ui/TextArea';
import { readPastedGrades } from './grade-input';
import styles from './Gradebook.module.css';

interface PasteGradesDialogProps {
  columns: readonly GradeColumn[];
  /** The students in the order the sheet shows them. */
  students: readonly GradebookStudent[];
  /** The note each student already has in a column, kept when their score is replaced. */
  noteOf: (columnId: string, studentId: string) => string | null;
  pending: boolean;
  error: string | null;
  onApply: (columnId: string, entries: (GradeInput & { studentId: string })[]) => void;
  onClose: () => void;
}

/**
 * Fills a column from a spreadsheet: paste, check the preview, then record. Nothing is saved until
 * the doctor has seen which rows were understood and which were not.
 */
export function PasteGradesDialog({
  columns,
  students,
  noteOf,
  pending,
  error,
  onApply,
  onClose,
}: PasteGradesDialogProps) {
  const { t } = useTranslation();
  const [columnId, setColumnId] = useState(columns[0]?.id ?? '');
  const [text, setText] = useState('');
  const column = columns.find((entry) => entry.id === columnId);
  const rows = useMemo(
    () => (column ? readPastedGrades(text, students, column.maxScore) : []),
    [text, students, column],
  );
  const ready = rows.filter((row) => row.student && row.input && !row.problem);
  const problems = rows.filter((row) => row.problem);

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('pasteGrades.title')}
      description={t('pasteGrades.lead')}
      dismissOnBackdrop={!pending && text === ''}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={pending}
            disabled={!column || ready.length === 0}
            onClick={() => {
              if (!column) {
                return;
              }
              onApply(
                column.id,
                ready.flatMap((row) =>
                  row.student && row.input
                    ? [
                        {
                          studentId: row.student.id,
                          ...row.input,
                          note: noteOf(column.id, row.student.id),
                        },
                      ]
                    : [],
                ),
              );
            }}
          >
            {t('pasteGrades.apply', { count: ready.length })}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Field label={t('pasteGrades.column')}>
          {(props) => (
            <select
              {...props}
              className={fieldStyles.input}
              value={columnId}
              onChange={(event) => {
                setColumnId(event.target.value);
              }}
            >
              {columns.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title} ({t('grades.outOf', { max: entry.maxScore })})
                </option>
              ))}
            </select>
          )}
        </Field>
        <TextArea
          label={t('pasteGrades.paste')}
          hint={t('pasteGrades.pasteHint')}
          rows={6}
          dir="ltr"
          value={text}
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />

        {rows.length > 0 && (
          <>
            <p className={styles.pasteSummary} aria-live="polite">
              <strong>{t('pasteGrades.ready', { count: ready.length })}</strong>
              {problems.length > 0 && (
                <span data-tone="danger">
                  {' · '}
                  {t('pasteGrades.skipped', { count: problems.length })}
                </span>
              )}
            </p>
            <div className={styles.scroller}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{t('pasteGrades.pasted')}</th>
                    <th scope="col">{t('grades.student')}</th>
                    <th scope="col">{t('pasteGrades.result')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    // Pasted lines can repeat, so a line's place is its key.
                    <tr key={index} data-problem={row.problem !== null}>
                      <td dir="ltr">{row.source}</td>
                      <td>{row.student?.name ?? '—'}</td>
                      <td>
                        {row.problem
                          ? t(`pasteGrades.problems.${row.problem}`, { max: column?.maxScore ?? 0 })
                          : row.input === null
                            ? t('pasteGrades.empty')
                            : row.input.status === 'absent'
                              ? t('grades.statusAbsent')
                              : row.input.status === 'excused'
                                ? t('grades.statusExcused')
                                : row.input.score}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {error && (
          <Alert tone="danger" live>
            {error}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
