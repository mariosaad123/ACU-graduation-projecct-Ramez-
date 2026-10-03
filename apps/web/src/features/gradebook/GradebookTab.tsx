import {
  GRADE_COLUMN_KINDS,
  GRADE_MAX_SCORE,
  GRADE_NOTE_MAX_LENGTH,
  bandOf,
  gradeColumnInputSchema,
  totalPercent,
  type Grade,
  type GradeColumn,
  type GradeColumnKind,
  type GradeInput,
  type GradebookStudent,
  type GroupView,
} from '@acu/shared';
import {
  EyeIcon,
  EyeSlashIcon,
  MicrosoftExcelLogoIcon,
  NotePencilIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { RadioGroup } from '../../components/ui/RadioGroup';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { TextArea } from '../../components/ui/TextArea';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/toast/toast-context';
import { describeApiError } from '../auth/api-errors';
import { Avatar } from '../auth/Avatar';
import { useDeleteColumn, useGradebook, useSaveColumn, useSetGrades } from './api';
import { ExportDialog } from './ExportDialog';
import styles from './Gradebook.module.css';

/** What may be typed in a cell instead of a number, in either language. */
const ABSENT = ['غ', 'غائب', 'a', 'abs'];
const EXCUSED = ['ع', 'معذور', 'e', 'exc'];

/** Arabic-Indic digits and the Arabic decimal comma, as a doctor may type them. */
function toNumber(text: string): number | null {
  const western = text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[٫,]/g, '.');
  return /^\d+(\.\d{1,2})?$/.test(western) ? Number(western) : null;
}

function ColumnDialog({
  groupId,
  column,
  onClose,
}: {
  groupId: string;
  column: GradeColumn | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSaveColumn(groupId);
  const remove = useDeleteColumn(groupId);
  const [title, setTitle] = useState(column?.title ?? '');
  const [kind, setKind] = useState<GradeColumnKind>(column?.kind ?? 'quiz');
  const [maxScore, setMaxScore] = useState(String(column?.maxScore ?? 10));
  const [weight, setWeight] = useState(column?.weight ? String(column.weight) : '');
  const [heldOn, setHeldOn] = useState(column?.heldOn ?? '');
  const [published, setPublished] = useState(column?.published ?? false);
  const [problems, setProblems] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);

  const submit = () => {
    const parsed = gradeColumnInputSchema.safeParse({
      title,
      kind,
      maxScore: toNumber(maxScore.trim()) ?? Number.NaN,
      weight: weight.trim() ? (toNumber(weight.trim()) ?? Number.NaN) : null,
      heldOn: heldOn || null,
      published,
    });
    if (!parsed.success) {
      setProblems(
        Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), true])),
      );
      return;
    }
    save.mutate(
      { id: column?.id ?? null, input: parsed.data },
      {
        onSuccess: () => {
          toast({
            tone: 'success',
            title: column ? t('grades.columnSaved') : t('grades.columnAdded'),
          });
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={column ? t('grades.editColumn') : t('grades.addColumn')}
      description={t('grades.columnHint')}
      dismissOnBackdrop={false}
      footer={
        <>
          {column && (
            <Button
              variant="ghost"
              iconStart={<TrashIcon aria-hidden="true" />}
              className={styles.deleteColumn}
              onClick={() => {
                setConfirming(true);
              }}
            >
              {t('grades.deleteColumn')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            {column ? t('groups.save') : t('grades.addColumn')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <TextField
          label={t('grades.columnTitle')}
          hint={t('grades.columnTitleHint')}
          error={problems.title ? t('grades.columnTitleError') : undefined}
          maxLength={60}
          dir="auto"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setProblems({});
          }}
        />
        <Select
          label={t('grades.kind')}
          value={kind}
          options={GRADE_COLUMN_KINDS.map((value) => ({
            value,
            label: t(`grades.kinds.${value}`),
          }))}
          onChange={(event) => {
            setKind(event.target.value as GradeColumnKind);
          }}
        />
        <div className={styles.formRow}>
          <TextField
            label={t('grades.maxScore')}
            error={
              problems.maxScore ? t('grades.maxScoreError', { max: GRADE_MAX_SCORE }) : undefined
            }
            inputMode="decimal"
            dir="ltr"
            value={maxScore}
            onChange={(event) => {
              setMaxScore(event.target.value);
              setProblems({});
            }}
          />
          <TextField
            label={t('grades.weight')}
            hint={t('grades.weightHint')}
            error={problems.weight ? t('grades.weightError') : undefined}
            optional
            inputMode="decimal"
            dir="ltr"
            value={weight}
            onChange={(event) => {
              setWeight(event.target.value);
              setProblems({});
            }}
          />
        </div>
        <TextField
          label={t('grades.heldOn')}
          type="date"
          optional
          value={heldOn}
          onChange={(event) => {
            setHeldOn(event.target.value);
          }}
        />
        <Checkbox
          label={t('grades.publish')}
          hint={t('grades.publishHint')}
          checked={published}
          onChange={(event) => {
            setPublished(event.target.checked);
          }}
        />
        {save.isError && (
          <Alert tone="danger" live>
            {describeApiError(t, save.error)}
          </Alert>
        )}
      </div>
      {column && (
        <ConfirmDialog
          open={confirming}
          danger
          title={t('grades.deleteColumnTitle', { name: column.title })}
          description={t('grades.deleteColumnBody')}
          confirmLabel={t('grades.deleteColumn')}
          pending={remove.isPending}
          error={remove.isError ? describeApiError(t, remove.error) : null}
          onClose={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            remove.mutate(column.id, {
              onSuccess: () => {
                toast({ tone: 'success', title: t('grades.columnDeleted') });
                onClose();
              },
            });
          }}
        />
      )}
    </Dialog>
  );
}

interface CellTarget {
  column: GradeColumn;
  student: GradebookStudent;
  grade: Grade | undefined;
}

function CellDialog({
  target,
  onSave,
  onClose,
}: {
  target: CellTarget;
  onSave: (input: GradeInput) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { column, student, grade } = target;
  const [status, setStatus] = useState(grade?.status ?? 'scored');
  const [score, setScore] = useState(
    grade?.score !== null && grade?.score !== undefined ? String(grade.score) : '',
  );
  const [note, setNote] = useState(grade?.note ?? '');
  const [invalid, setInvalid] = useState(false);

  const submit = () => {
    const value = score.trim() ? toNumber(score.trim()) : null;
    if (status === 'scored' && score.trim() && (value === null || value > column.maxScore)) {
      setInvalid(true);
      return;
    }
    onSave({ status, score: status === 'scored' ? value : null, note: note.trim() || null });
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={t('grades.cellTitle', { student: student.name, column: column.title })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit}>{t('groups.save')}</Button>
        </>
      }
    >
      <div className={styles.form}>
        <RadioGroup
          legend={t('grades.cellStatus')}
          name="grade-status"
          value={status}
          options={[
            { value: 'scored', label: t('grades.statusScored') },
            {
              value: 'absent',
              label: t('grades.statusAbsent'),
              hint: t('grades.statusAbsentHint'),
            },
            {
              value: 'excused',
              label: t('grades.statusExcused'),
              hint: t('grades.statusExcusedHint'),
            },
          ]}
          onChange={setStatus}
        />
        {status === 'scored' && (
          <TextField
            label={t('grades.scoreOutOf', { max: column.maxScore })}
            error={invalid ? t('grades.scoreError', { max: column.maxScore }) : undefined}
            optional
            inputMode="decimal"
            dir="ltr"
            value={score}
            onChange={(event) => {
              setScore(event.target.value);
              setInvalid(false);
            }}
          />
        )}
        <TextArea
          label={t('grades.note')}
          hint={t('grades.noteHint')}
          optional
          rows={2}
          maxLength={GRADE_NOTE_MAX_LENGTH}
          dir="auto"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </div>
    </Dialog>
  );
}

function GradeCell({
  target,
  readOnly,
  onSave,
  onDetails,
}: {
  target: CellTarget;
  readOnly: boolean;
  onSave: (input: GradeInput) => void;
  onDetails: () => void;
}) {
  const { t } = useTranslation();
  const { column, student, grade } = target;
  const shown =
    grade?.status === 'absent'
      ? t('grades.absentMark')
      : grade?.status === 'excused'
        ? t('grades.excusedMark')
        : grade?.score !== null && grade?.score !== undefined
          ? String(grade.score)
          : '';
  const [text, setText] = useState(shown);
  const [invalid, setInvalid] = useState(false);
  const toast = useToast();

  /** Saves what was typed; false when it is not a score this column can hold. */
  const commit = (): boolean => {
    const typed = text.trim().toLocaleLowerCase();
    if (typed === shown.toLocaleLowerCase()) {
      setInvalid(false);
      return true;
    }
    const note = grade?.note ?? null;
    if (typed === '') {
      onSave({ status: 'scored', score: null, note });
    } else if (ABSENT.includes(typed)) {
      onSave({ status: 'absent', score: null, note });
    } else if (EXCUSED.includes(typed)) {
      onSave({ status: 'excused', score: null, note });
    } else {
      const value = toNumber(typed);
      if (value === null || value > column.maxScore) {
        // Said once: leaving the cell afterwards commits the same text again.
        if (!invalid) {
          toast({ tone: 'danger', title: t('grades.scoreError', { max: column.maxScore }) });
        }
        setInvalid(true);
        return false;
      }
      onSave({ status: 'scored', score: value, note });
    }
    setInvalid(false);
    return true;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!commit()) {
        return;
      }
      // Like a spreadsheet: on to the same column of the next (or previous) student.
      const cells = [
        ...document.querySelectorAll<HTMLInputElement>(`input[data-column="${column.id}"]`),
      ];
      const next = cells[cells.indexOf(event.currentTarget) + (event.key === 'ArrowUp' ? -1 : 1)];
      next?.focus();
      next?.select();
    }
    if (event.key === 'Escape') {
      setText(shown);
      setInvalid(false);
    }
  };

  const low =
    grade?.status === 'scored' && grade.score !== null && grade.score < column.maxScore / 2;

  return (
    <div className={styles.cell} data-status={grade?.status} data-low={low}>
      <input
        className={styles.cellInput}
        data-column={column.id}
        inputMode="decimal"
        dir="ltr"
        value={text}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        aria-label={t('grades.cellLabel', { student: student.name, column: column.title })}
        title={invalid ? t('grades.scoreError', { max: column.maxScore }) : undefined}
        onChange={(event) => {
          setText(event.target.value);
          setInvalid(false);
        }}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      {!readOnly && (
        <button
          type="button"
          className={styles.cellMore}
          data-note={Boolean(grade?.note)}
          aria-label={t('grades.cellDetails', { student: student.name, column: column.title })}
          title={grade?.note ?? t('grades.details')}
          onClick={onDetails}
        >
          <NotePencilIcon aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** The group's grades: a column for each quiz or task, a row for each student, typed like a sheet. */
export function GradebookTab({ view }: { view: GroupView }) {
  const { t } = useTranslation();
  const toast = useToast();
  const gradebook = useGradebook(view.id);
  const setGrades = useSetGrades(view.id);
  const [columnDialog, setColumnDialog] = useState<{ column: GradeColumn | null } | null>(null);
  const [cellDialog, setCellDialog] = useState<CellTarget | null>(null);
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
  const { columns, students, grades } = gradebook.data;
  const gradeOf = (columnId: string, studentId: string) =>
    grades.find((grade) => grade.columnId === columnId && grade.studentId === studentId);
  const totalOf = (studentId: string) =>
    totalPercent(columns, (columnId) => gradeOf(columnId, studentId));

  const save = (target: CellTarget, input: GradeInput) => {
    setGrades.mutate(
      { columnId: target.column.id, entries: [{ studentId: target.student.id, ...input }] },
      {
        onError: (error) => {
          toast({ tone: 'danger', title: describeApiError(t, error) });
        },
      },
    );
  };

  const active = students.filter((student) => student.status === 'active');
  const totals = active
    .map((student) => totalOf(student.id))
    .filter((total): total is number => total !== null);
  const classAverage =
    totals.length > 0 ? totals.reduce((sum, total) => sum + total, 0) / totals.length : null;
  const passRate =
    totals.length > 0 ? (totals.filter((total) => total >= 50).length / totals.length) * 100 : null;
  const readOnly = view.archived;

  const columnAverage = (column: GradeColumn) => {
    const scores = grades
      .filter(
        (grade) =>
          grade.columnId === column.id && grade.status === 'scored' && grade.score !== null,
      )
      .map((grade) => grade.score ?? 0);
    return scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
  };

  return (
    <section className={styles.tab} aria-labelledby={`grades-${view.id}`}>
      <header className={styles.head}>
        <div>
          <h2 id={`grades-${view.id}`} className={styles.title}>
            {t('grades.title')}
          </h2>
          <p className={styles.muted}>{t('grades.lead')}</p>
        </div>
        <div className={styles.headActions}>
          <Button
            variant="secondary"
            iconStart={<MicrosoftExcelLogoIcon aria-hidden="true" />}
            onClick={() => {
              setExporting(true);
            }}
          >
            {t('grades.export')}
          </Button>
          {!readOnly && (
            <Button
              iconStart={<PlusIcon aria-hidden="true" />}
              onClick={() => {
                setColumnDialog({ column: null });
              }}
            >
              {t('grades.addColumn')}
            </Button>
          )}
        </div>
      </header>

      <dl className={styles.stats}>
        <div>
          <dt>{t('grades.students')}</dt>
          <dd>{active.length}</dd>
        </div>
        <div>
          <dt>{t('grades.classAverage')}</dt>
          <dd>{classAverage === null ? '—' : `${classAverage.toFixed(1)}%`}</dd>
        </div>
        <div>
          <dt>{t('grades.passRate')}</dt>
          <dd>{passRate === null ? '—' : `${passRate.toFixed(0)}%`}</dd>
        </div>
        <div>
          <dt>{t('grades.columns')}</dt>
          <dd>{columns.length}</dd>
        </div>
      </dl>

      {columns.length === 0 ? (
        <p className={styles.empty}>{t('grades.noColumns')}</p>
      ) : students.length === 0 ? (
        <p className={styles.empty}>{t('grades.noStudents')}</p>
      ) : (
        <>
          <p className={styles.muted}>{t('grades.typingHint')}</p>
          <div
            className={styles.scroller}
            tabIndex={0}
            role="region"
            aria-label={t('grades.title')}
          >
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" className={styles.sticky}>
                    {t('grades.student')}
                  </th>
                  {columns.map((column) => (
                    <th key={column.id} scope="col">
                      <button
                        type="button"
                        className={styles.columnHead}
                        disabled={readOnly}
                        aria-label={t('grades.editColumnNamed', { name: column.title })}
                        onClick={() => {
                          setColumnDialog({ column });
                        }}
                      >
                        <span className={styles.columnTitle} dir="auto">
                          {column.title}
                        </span>
                        <span className={styles.columnMeta}>
                          {t(`grades.kinds.${column.kind}`)} ·{' '}
                          {t('grades.outOf', { max: column.maxScore })}
                          {column.weight !== null && ` · ${String(column.weight)}%`}
                        </span>
                        <span className={styles.columnMeta} data-published={column.published}>
                          {column.published ? (
                            <EyeIcon aria-hidden="true" />
                          ) : (
                            <EyeSlashIcon aria-hidden="true" />
                          )}
                          {column.published ? t('grades.published') : t('grades.hidden')}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th scope="col">{t('grades.total')}</th>
                  <th scope="col">{t('grades.band')}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const total = totalOf(student.id);
                  const band = total === null ? null : bandOf(total);
                  return (
                    <tr key={student.id} data-out={student.status !== 'active'}>
                      <th scope="row" className={styles.sticky}>
                        <Link to={`/app/people/${student.id}`} className={styles.student}>
                          <Avatar user={student} size="2rem" />
                          <span className={styles.studentText}>
                            <span className={styles.studentName}>{student.name}</span>
                            <span className={styles.columnMeta}>
                              {student.status !== 'active'
                                ? t(`grades.memberStatus.${student.status}`)
                                : (student.universityId ?? t('grades.noUniversityId'))}
                            </span>
                          </span>
                        </Link>
                      </th>
                      {columns.map((column) => {
                        const grade = gradeOf(column.id, student.id);
                        const target = { column, student, grade };
                        return (
                          <td key={column.id}>
                            <GradeCell
                              // A cell takes the saved value again whenever it changes.
                              key={`${grade?.status ?? ''}-${String(grade?.score ?? '')}`}
                              target={target}
                              readOnly={readOnly}
                              onSave={(input) => {
                                save(target, input);
                              }}
                              onDetails={() => {
                                setCellDialog(target);
                              }}
                            />
                          </td>
                        );
                      })}
                      <td className={styles.totalCell}>
                        {total === null ? '—' : `${total.toFixed(1)}%`}
                      </td>
                      <td>
                        {band && (
                          <span className={styles.band} data-band={band}>
                            {t(`grades.bands.${band}`)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className={styles.sticky}>
                    {t('grades.average')}
                  </th>
                  {columns.map((column) => {
                    const average = columnAverage(column);
                    return (
                      <td key={column.id} className={styles.totalCell}>
                        {average === null ? '—' : average.toFixed(1)}
                      </td>
                    );
                  })}
                  <td className={styles.totalCell}>
                    {classAverage === null ? '—' : `${classAverage.toFixed(1)}%`}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className={styles.muted}>{t('grades.legend')}</p>
        </>
      )}

      {columnDialog && (
        <ColumnDialog
          key={columnDialog.column?.id ?? 'new'}
          groupId={view.id}
          column={columnDialog.column}
          onClose={() => {
            setColumnDialog(null);
          }}
        />
      )}
      {cellDialog && (
        <CellDialog
          target={cellDialog}
          onSave={(input) => {
            save(cellDialog, input);
          }}
          onClose={() => {
            setCellDialog(null);
          }}
        />
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
