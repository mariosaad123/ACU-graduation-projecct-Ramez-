import {
  GRADE_NOTE_MAX_LENGTH,
  type Assignment,
  type SubmissionRow,
  type SubmissionState,
} from '@acu/shared';
import {
  ArrowRightIcon,
  BellRingingIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { TextArea } from '../../components/ui/TextArea';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/toast/toast-context';
import { useLocale } from '../../i18n/use-locale';
import { describeApiError } from '../auth/api-errors';
import { Avatar } from '../auth/Avatar';
import { AttachmentView } from '../chat/AttachmentView';
import { readCell } from '../gradebook/grade-input';
import { useAssignmentDetail, useGradeSubmission } from './api';
import { NudgeDialog } from './NudgeDialog';
import styles from './Coursework.module.css';

const FILTERS = ['all', 'toGrade', 'graded', 'missing'] as const;
type Filter = (typeof FILTERS)[number];

function matches(row: SubmissionRow, filter: Filter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'toGrade':
      return row.state === 'submitted' || row.state === 'late';
    case 'graded':
      return row.state === 'graded';
    case 'missing':
      return row.state === 'missing';
  }
}

function scoreText(row: SubmissionRow, absent: string, excused: string): string {
  if (!row.grade) {
    return '';
  }
  if (row.grade.status === 'absent') {
    return absent;
  }
  return row.grade.status === 'excused' ? excused : String(row.grade.score ?? '');
}

/** One student's work with the box to grade it. Remounted for each student, so nothing carries over. */
function GradeForm({
  groupId,
  assignment,
  row,
  readOnly,
  onSaved,
}: {
  groupId: string;
  assignment: Assignment;
  row: SubmissionRow;
  readOnly: boolean;
  /** `next` asks to move on to the following student once this one is saved. */
  onSaved: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { intlLocale } = useLocale();
  const grade = useGradeSubmission(groupId, assignment.id);
  const [score, setScore] = useState(
    scoreText(row, t('grades.absentMark'), t('grades.excusedMark')),
  );
  const [note, setNote] = useState(row.grade?.note ?? '');
  const [problem, setProblem] = useState<'invalid' | 'tooHigh' | null>(null);
  const when = useMemo(
    () => new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium', timeStyle: 'short' }),
    [intlLocale],
  );
  const { submission } = row;

  const save = (next: boolean) => {
    const cell = readCell(score, assignment.maxScore);
    if ('problem' in cell) {
      setProblem(cell.problem);
      return;
    }
    grade.mutate(
      {
        studentId: row.student.id,
        grade: {
          status: cell.input?.status ?? 'scored',
          score: cell.input?.score ?? null,
          note: note.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ tone: 'success', title: t('review.saved', { name: row.student.name }) });
          onSaved(next);
        },
      },
    );
  };

  return (
    <div className={styles.work}>
      <header className={styles.workHead}>
        <Avatar user={row.student} size="2.75rem" />
        <div>
          <Link to={`/app/people/${row.student.id}`} className={styles.workName}>
            {row.student.name}
          </Link>
          <p className={styles.muted}>
            {t('profile.universityId')}:{' '}
            <span dir="ltr">{row.student.universityId ?? t('grades.noUniversityId')}</span>
          </p>
        </div>
        <span className={styles.state} data-state={row.state}>
          {t(`assignments.states.${row.state}`)}
        </span>
      </header>

      {submission ? (
        <>
          <p className={styles.muted}>
            {t('review.handedIn', { when: when.format(new Date(submission.submittedAt)) })}
            {submission.updatedAt !== submission.submittedAt &&
              ` · ${t('review.changed', { when: when.format(new Date(submission.updatedAt)) })}`}
          </p>
          {submission.body && (
            <p className={styles.workBody} dir="auto">
              {submission.body}
            </p>
          )}
          {submission.files.length > 0 && (
            <ul className={styles.attachments}>
              {submission.files.map((file) => (
                <li key={file.id}>
                  <AttachmentView attachment={file} authorName={row.student.name} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className={styles.empty}>{t('review.nothing')}</p>
      )}

      <form
        className={styles.gradeForm}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save(true);
        }}
      >
        <TextField
          label={t('grades.scoreOutOf', { max: assignment.maxScore })}
          hint={t('review.scoreHint')}
          error={
            problem
              ? t(problem === 'tooHigh' ? 'grades.scoreError' : 'review.scoreInvalid', {
                  max: assignment.maxScore,
                })
              : undefined
          }
          optional
          inputMode="decimal"
          dir="ltr"
          className={styles.scoreField}
          value={score}
          disabled={readOnly}
          onChange={(event) => {
            setScore(event.target.value);
            setProblem(null);
          }}
        />
        <TextArea
          label={t('grades.note')}
          hint={t('review.noteHint')}
          optional
          rows={3}
          dir="auto"
          maxLength={GRADE_NOTE_MAX_LENGTH}
          value={note}
          disabled={readOnly}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
        {grade.isError && (
          <Alert tone="danger" live>
            {describeApiError(t, grade.error)}
          </Alert>
        )}
        {!readOnly && (
          <div className={styles.gradeActions}>
            <Button type="submit" loading={grade.isPending}>
              {t('review.saveNext')}
            </Button>
            <Button
              variant="secondary"
              disabled={grade.isPending}
              onClick={() => {
                save(false);
              }}
            >
              {t('groups.save')}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}

/**
 * The staff's view of one assignment: the students on one side, each one's work and grade box on
 * the other. Saving a grade writes it straight into the gradebook column of the assignment.
 */
export function ReviewPanel({
  groupId,
  assignmentId,
  readOnly,
  onBack,
}: {
  groupId: string;
  assignmentId: string;
  readOnly: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const detail = useAssignmentDetail(groupId, assignmentId);
  const [filter, setFilter] = useState<Filter>('all');
  const [chosen, setChosen] = useState<string | null>(null);
  const [nudging, setNudging] = useState(false);

  const back = (
    <button type="button" className={styles.back} onClick={onBack}>
      <ArrowRightIcon className="mirror-in-rtl" aria-hidden="true" />
      {t('review.back')}
    </button>
  );
  if (detail.isPending) {
    return (
      <>
        {back}
        <Skeleton shape="block" blockSize="16rem" />
      </>
    );
  }
  if (detail.isError) {
    return (
      <>
        {back}
        <Alert tone="danger" live>
          {describeApiError(t, detail.error)}{' '}
          <button
            type="button"
            className={styles.inlineAction}
            onClick={() => {
              void detail.refetch();
            }}
          >
            {t('common.retry')}
          </button>
        </Alert>
      </>
    );
  }

  const { assignment, submissions } = detail.data;
  const shown = submissions.filter((row) => matches(row, filter));
  // Without a choice, the first student whose work is waiting comes up.
  const current =
    shown.find((row) => row.student.id === chosen) ??
    shown.find((row) => matches(row, 'toGrade')) ??
    shown[0];
  const position = current ? shown.indexOf(current) : -1;
  const missing = submissions.filter((row) => row.state === 'missing');
  const countOf = (state: Filter) => submissions.filter((row) => matches(row, state)).length;
  const labels: Record<SubmissionState, string> = {
    missing: t('assignments.states.missing'),
    submitted: t('assignments.states.submitted'),
    late: t('assignments.states.late'),
    graded: t('assignments.states.graded'),
  };

  return (
    <section className={styles.review} aria-labelledby={`review-${assignment.id}`}>
      {back}
      <header className={styles.head}>
        <div>
          <h2 id={`review-${assignment.id}`} className={styles.title} dir="auto">
            {assignment.title}
          </h2>
          <p className={styles.muted}>
            {t('review.progress', {
              submitted: assignment.progress?.submitted ?? 0,
              graded: assignment.progress?.graded ?? 0,
              students: assignment.progress?.students ?? 0,
            })}
            {' · '}
            {assignment.progress?.released ? t('review.released') : t('review.notReleased')}
          </p>
        </div>
        {!readOnly && missing.length > 0 && (
          <Button
            variant="secondary"
            iconStart={<BellRingingIcon aria-hidden="true" />}
            onClick={() => {
              setNudging(true);
            }}
          >
            {t('review.nudgeMissing', { count: missing.length })}
          </Button>
        )}
      </header>

      <div className={styles.filters} role="group" aria-label={t('review.filter')}>
        {FILTERS.map((entry) => (
          <button
            key={entry}
            type="button"
            className={styles.filter}
            aria-pressed={filter === entry}
            onClick={() => {
              setFilter(entry);
              setChosen(null);
            }}
          >
            {t(`review.filters.${entry}`)} ({countOf(entry)})
          </button>
        ))}
      </div>

      {submissions.length === 0 ? (
        <p className={styles.empty}>{t('grades.noStudents')}</p>
      ) : !current ? (
        <p className={styles.empty}>{t('review.noneInFilter')}</p>
      ) : (
        <div className={styles.reviewLayout}>
          <ol className={styles.roster} aria-label={t('grades.student')}>
            {shown.map((row) => (
              <li key={row.student.id}>
                <button
                  type="button"
                  className={styles.rosterItem}
                  aria-current={row.student.id === current.student.id}
                  onClick={() => {
                    setChosen(row.student.id);
                  }}
                >
                  <span className={styles.rosterName}>{row.student.name}</span>
                  <span className={styles.rosterMeta}>
                    <span dir="ltr">{row.student.universityId ?? '—'}</span>
                    <span className={styles.state} data-state={row.state} dir="auto">
                      {row.state === 'graded' && row.grade?.status === 'scored'
                        ? `${String(row.grade.score ?? '')} / ${String(assignment.maxScore)}`
                        : labels[row.state]}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className={styles.reviewMain}>
            <div className={styles.pager}>
              <Button
                size="sm"
                variant="ghost"
                iconStart={<CaretLeftIcon className="mirror-in-rtl" aria-hidden="true" />}
                disabled={position <= 0}
                onClick={() => {
                  setChosen(shown[position - 1]?.student.id ?? null);
                }}
              >
                {t('review.previous')}
              </Button>
              <span className={styles.muted}>
                {t('review.position', { current: position + 1, total: shown.length })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                iconEnd={<CaretRightIcon className="mirror-in-rtl" aria-hidden="true" />}
                disabled={position >= shown.length - 1}
                onClick={() => {
                  setChosen(shown[position + 1]?.student.id ?? null);
                }}
              >
                {t('review.next')}
              </Button>
            </div>
            <GradeForm
              key={current.student.id}
              groupId={groupId}
              assignment={assignment}
              row={current}
              readOnly={readOnly}
              onSaved={(next) => {
                if (next) {
                  // The student after this one, as the list stood when the grade was saved.
                  setChosen(shown[position + 1]?.student.id ?? current.student.id);
                }
              }}
            />
          </div>
        </div>
      )}

      {nudging && (
        <NudgeDialog
          groupId={groupId}
          students={missing.map((row) => row.student)}
          reason="assignment"
          targetId={assignment.id}
          onClose={() => {
            setNudging(false);
          }}
        />
      )}
    </section>
  );
}
