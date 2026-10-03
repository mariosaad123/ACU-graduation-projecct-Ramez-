import type { Assignment, GroupView } from '@acu/shared';
import {
  CalendarDotsIcon,
  ClipboardTextIcon,
  EyeIcon,
  EyeSlashIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/toast/toast-context';
import { describeApiError } from '../auth/api-errors';
import { AttachmentView } from '../chat/AttachmentView';
import { linkify } from '../chat/linkify';
import { useAssignments, useDeleteAssignment, useUpdateAssignment, useWithdrawWork } from './api';
import { AssignmentDialog } from './AssignmentDialog';
import { ReviewPanel } from './ReviewPanel';
import { SubmitDialog } from './SubmitDialog';
import { useDue } from './use-due';
import styles from './Coursework.module.css';

function AssignmentCard({
  view,
  assignment,
  highlighted,
  onEdit,
  onReview,
  onSubmit,
  onDelete,
}: {
  view: GroupView;
  assignment: Assignment;
  highlighted: boolean;
  onEdit: () => void;
  onReview: () => void;
  onSubmit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const due = useDue();
  const update = useUpdateAssignment(view.id);
  const withdraw = useWithdrawWork(view.id);
  const [withdrawing, setWithdrawing] = useState(false);
  const { mine, progress } = assignment;
  const deadline = assignment.dueAt ? due(assignment.dueAt) : null;
  const readOnly = view.archived;

  const change = (changes: { closed?: boolean; released?: boolean }, done: string) => {
    update.mutate(
      { id: assignment.id, changes },
      {
        onSuccess: () => {
          toast({ tone: 'success', title: done });
        },
        onError: (error) => {
          toast({ tone: 'danger', title: describeApiError(t, error) });
        },
      },
    );
  };

  return (
    <li
      id={`assignment-${assignment.id}`}
      className={styles.card}
      data-highlighted={highlighted}
      data-state={mine?.state}
    >
      <header className={styles.cardHead}>
        <div className={styles.cardTitleBlock}>
          <h3 className={styles.cardTitle} dir="auto">
            {assignment.title}
          </h3>
          <p className={styles.muted}>
            {t(`grades.kinds.${assignment.kind}`)} ·{' '}
            {t('grades.outOf', { max: assignment.maxScore })} · {assignment.author.name}
          </p>
        </div>
        <div className={styles.badges}>
          {mine && (
            <span className={styles.state} data-state={mine.state}>
              {t(`assignments.states.${mine.state}`)}
            </span>
          )}
          {!assignment.accepting && <Badge>{t('assignments.closed')}</Badge>}
        </div>
      </header>

      <p className={styles.due} data-soon={deadline?.soon} data-past={deadline?.past}>
        <CalendarDotsIcon aria-hidden="true" />
        {deadline ? (
          <>
            <span>{t('assignments.due', { when: deadline.full })}</span>
            <span className={styles.dueRelative}>({deadline.relative})</span>
            {deadline.past && assignment.accepting && (
              <span>· {t('assignments.lateAccepted')}</span>
            )}
          </>
        ) : (
          t('assignments.noDue')
        )}
      </p>

      {assignment.instructions && (
        <p className={styles.instructions} dir="auto">
          {linkify(assignment.instructions, `assignment-${assignment.id}`)}
        </p>
      )}
      {assignment.attachments.length > 0 && (
        <ul className={styles.attachments}>
          {assignment.attachments.map((file) => (
            <li key={file.id}>
              <AttachmentView attachment={file} authorName={assignment.author.name} />
            </li>
          ))}
        </ul>
      )}

      {mine && (
        <div className={styles.mine}>
          {mine.grade && (
            <p className={styles.myGrade}>
              <span className={styles.myScore} dir="ltr">
                {mine.grade.status === 'scored'
                  ? `${String(mine.grade.score ?? '—')} / ${String(assignment.maxScore)}`
                  : t(
                      mine.grade.status === 'absent'
                        ? 'grades.statusAbsent'
                        : 'grades.statusExcused',
                    )}
              </span>
              {mine.grade.note && (
                <span className={styles.feedback} dir="auto">
                  {mine.grade.note}
                </span>
              )}
            </p>
          )}
          {mine.submission && (
            <details className={styles.myWork}>
              <summary>{t('assignments.myWork')}</summary>
              {mine.submission.body && (
                <p className={styles.workBody} dir="auto">
                  {mine.submission.body}
                </p>
              )}
              {mine.submission.files.length > 0 && (
                <ul className={styles.attachments}>
                  {mine.submission.files.map((file) => (
                    <li key={file.id}>
                      <AttachmentView attachment={file} authorName={t('assignments.myWork')} />
                    </li>
                  ))}
                </ul>
              )}
            </details>
          )}
          {mine.submission && !mine.grade && !mine.canSubmit && assignment.accepting && (
            <p className={styles.muted}>{t('assignments.beingGraded')}</p>
          )}
          {!mine.submission && !assignment.accepting && (
            <p className={styles.muted}>{t('assignments.missedHint')}</p>
          )}
          {mine.canSubmit && (
            <div className={styles.actions}>
              <Button onClick={onSubmit}>
                {mine.submission ? t('assignments.editWork') : t('assignments.handIn')}
              </Button>
              {mine.submission && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    withdraw.reset();
                    setWithdrawing(true);
                  }}
                >
                  {t('assignments.withdraw')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {progress && (
        <div className={styles.staff}>
          <dl className={styles.progress}>
            <div>
              <dt>{t('assignments.handedInCount')}</dt>
              <dd>
                <bdi dir="ltr">
                  {progress.submitted} / {progress.students}
                </bdi>
              </dd>
            </div>
            <div>
              <dt>{t('assignments.gradedCount')}</dt>
              <dd>
                <bdi dir="ltr">
                  {progress.graded} / {progress.students}
                </bdi>
              </dd>
            </div>
            <div>
              <dt>{t('assignments.gradesState')}</dt>
              <dd data-released={progress.released}>
                {progress.released ? t('review.released') : t('review.notReleased')}
              </dd>
            </div>
          </dl>
          <div className={styles.actions}>
            <Button iconStart={<ClipboardTextIcon aria-hidden="true" />} onClick={onReview}>
              {t('assignments.review')}
            </Button>
            {!readOnly && (
              <>
                <Button
                  variant="secondary"
                  loading={update.isPending}
                  iconStart={
                    progress.released ? (
                      <EyeSlashIcon aria-hidden="true" />
                    ) : (
                      <EyeIcon aria-hidden="true" />
                    )
                  }
                  onClick={() => {
                    change(
                      { released: !progress.released },
                      progress.released
                        ? t('assignments.hiddenDone')
                        : t('assignments.releasedDone'),
                    );
                  }}
                >
                  {progress.released ? t('assignments.hide') : t('assignments.release')}
                </Button>
                <Button
                  variant="ghost"
                  disabled={update.isPending}
                  iconStart={
                    assignment.closed ? (
                      <LockSimpleOpenIcon aria-hidden="true" />
                    ) : (
                      <LockSimpleIcon aria-hidden="true" />
                    )
                  }
                  onClick={() => {
                    change(
                      { closed: !assignment.closed },
                      assignment.closed
                        ? t('assignments.reopenedDone')
                        : t('assignments.closedDone'),
                    );
                  }}
                >
                  {assignment.closed ? t('assignments.reopen') : t('assignments.close')}
                </Button>
                <Button
                  variant="ghost"
                  iconStart={<PencilSimpleIcon aria-hidden="true" />}
                  onClick={onEdit}
                >
                  {t('assignments.edit')}
                </Button>
                <Button
                  variant="ghost"
                  className={styles.danger}
                  iconStart={<TrashIcon aria-hidden="true" />}
                  onClick={onDelete}
                >
                  {t('chat.delete')}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={withdrawing}
        danger
        title={t('assignments.withdrawTitle')}
        description={t('assignments.withdrawBody')}
        confirmLabel={t('assignments.withdraw')}
        pending={withdraw.isPending}
        error={withdraw.isError ? describeApiError(t, withdraw.error) : null}
        onClose={() => {
          setWithdrawing(false);
        }}
        onConfirm={() => {
          withdraw.mutate(assignment.id, {
            onSuccess: () => {
              toast({ tone: 'success', title: t('assignments.withdrawn') });
              setWithdrawing(false);
            },
          });
        }}
      />
    </li>
  );
}

/**
 * A group's assignments. Students hand in their work here and later find their grade; the staff
 * create assignments, open what was handed in student by student, and grade it into the gradebook.
 */
export function AssignmentsTab({ view }: { view: GroupView }) {
  const { t } = useTranslation();
  const toast = useToast();
  const assignments = useAssignments(view.id);
  const remove = useDeleteAssignment(view.id);
  const [search, setSearch] = useSearchParams();
  const [dialog, setDialog] = useState<{ editing: Assignment | null } | null>(null);
  const [submitting, setSubmitting] = useState<Assignment | null>(null);
  const [deleting, setDeleting] = useState<Assignment | null>(null);
  const staff = view.can.teach;
  const wanted = search.get('assignment');
  const reviewing = staff ? search.get('review') : null;

  // A notification leads to one assignment: it is brought into view once the list is there.
  const loaded = assignments.isSuccess;
  useEffect(() => {
    if (loaded && wanted && !reviewing) {
      document.getElementById(`assignment-${wanted}`)?.scrollIntoView({ block: 'center' });
    }
  }, [loaded, wanted, reviewing]);

  const open = (id: string | null) => {
    const next = new URLSearchParams(search);
    if (id) {
      next.set('review', id);
    } else {
      next.delete('review');
    }
    setSearch(next, { replace: false, preventScrollReset: true });
  };

  if (reviewing) {
    return (
      <ReviewPanel
        groupId={view.id}
        assignmentId={reviewing}
        readOnly={view.archived}
        onBack={() => {
          open(null);
        }}
      />
    );
  }

  return (
    <section className={styles.tab} aria-labelledby={`assignments-${view.id}`}>
      <header className={styles.head}>
        <div>
          <h2 id={`assignments-${view.id}`} className={styles.title}>
            {t('assignments.title')}
          </h2>
          <p className={styles.muted}>
            {staff ? t('assignments.leadStaff') : t('assignments.leadStudent')}
          </p>
        </div>
        {staff && !view.archived && (
          <Button
            iconStart={<PlusIcon aria-hidden="true" />}
            onClick={() => {
              setDialog({ editing: null });
            }}
          >
            {t('assignments.new')}
          </Button>
        )}
      </header>

      {assignments.isPending && <Skeleton shape="block" blockSize="12rem" />}
      {assignments.isError && (
        <Alert tone="danger" live>
          {describeApiError(t, assignments.error)}{' '}
          <button
            type="button"
            className={styles.inlineAction}
            onClick={() => {
              void assignments.refetch();
            }}
          >
            {t('common.retry')}
          </button>
        </Alert>
      )}
      {assignments.isSuccess && assignments.data.length === 0 && (
        <p className={styles.empty}>
          {staff ? t('assignments.emptyStaff') : t('assignments.emptyStudent')}
        </p>
      )}
      {assignments.isSuccess && assignments.data.length > 0 && (
        <ul className={styles.list}>
          {assignments.data.map((assignment) => (
            <AssignmentCard
              key={assignment.id}
              view={view}
              assignment={assignment}
              highlighted={assignment.id === wanted}
              onEdit={() => {
                setDialog({ editing: assignment });
              }}
              onReview={() => {
                open(assignment.id);
              }}
              onSubmit={() => {
                setSubmitting(assignment);
              }}
              onDelete={() => {
                remove.reset();
                setDeleting(assignment);
              }}
            />
          ))}
        </ul>
      )}

      {dialog && (
        <AssignmentDialog
          key={dialog.editing?.id ?? 'new'}
          groupId={view.id}
          editing={dialog.editing}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {submitting && (
        <SubmitDialog
          key={submitting.id}
          groupId={view.id}
          assignment={submitting}
          onClose={() => {
            setSubmitting(null);
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        danger
        title={t('assignments.deleteTitle', { title: deleting?.title ?? '' })}
        description={t('assignments.deleteBody', { count: deleting?.progress?.submitted ?? 0 })}
        confirmLabel={t('assignments.deleteConfirm')}
        pending={remove.isPending}
        error={remove.isError ? describeApiError(t, remove.error) : null}
        onClose={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (!deleting) {
            return;
          }
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast({ tone: 'success', title: t('assignments.deleted') });
              setDeleting(null);
            },
          });
        }}
      />
    </section>
  );
}
