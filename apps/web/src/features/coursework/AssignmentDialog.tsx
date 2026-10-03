import {
  ASSIGNMENT_KINDS,
  ASSIGNMENT_MAX_FILES,
  ASSIGNMENT_TEXT_MAX_LENGTH,
  GRADE_MAX_SCORE,
  type Assignment,
  type AssignmentKind,
} from '@acu/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Dialog } from '../../components/ui/Dialog';
import { RadioGroup } from '../../components/ui/RadioGroup';
import { TextArea } from '../../components/ui/TextArea';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/toast/toast-context';
import { describeApiError } from '../auth/api-errors';
import { toNumber } from '../gradebook/grade-input';
import { useCreateAssignment, useUpdateAssignment } from './api';
import { FilePicker } from './FilePicker';
import styles from './Coursework.module.css';

/** An instant as the value of a datetime-local field, in the reader's own time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

interface AssignmentDialogProps {
  groupId: string;
  editing: Assignment | null;
  onClose: () => void;
}

/** Creates an assignment, or changes one. Mistakes are shown on their fields before anything is sent. */
export function AssignmentDialog({ groupId, editing, onClose }: AssignmentDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateAssignment(groupId);
  const update = useUpdateAssignment(groupId);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [instructions, setInstructions] = useState(editing?.instructions ?? '');
  const [kind, setKind] = useState<AssignmentKind>(editing?.kind ?? 'assignment');
  const [maxScore, setMaxScore] = useState(String(editing?.maxScore ?? 10));
  const [dueAt, setDueAt] = useState(toLocalInput(editing?.dueAt ?? null));
  const [allowLate, setAllowLate] = useState(editing?.allowLate ?? true);
  const [kept, setKept] = useState(editing?.attachments ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [problems, setProblems] = useState<{
    title?: boolean;
    maxScore?: boolean;
    dueAt?: boolean;
  }>({});
  const pending = create.isPending || update.isPending;
  const failure = create.error ?? update.error;

  const submit = () => {
    const score = toNumber(maxScore.trim());
    const due = dueAt ? new Date(dueAt) : null;
    const found = {
      title: title.trim() === '',
      maxScore: score === null || score <= 0 || score > GRADE_MAX_SCORE,
      // A deadline already behind us is almost always a slip of the hand.
      dueAt: due !== null && (Number.isNaN(due.getTime()) || (!editing && due <= new Date())),
    };
    if (found.title || found.maxScore || found.dueAt || score === null) {
      setProblems(found);
      return;
    }
    const input = {
      title: title.trim(),
      instructions: instructions.trim(),
      kind,
      maxScore: score,
      dueAt: due ? due.toISOString() : null,
      allowLate,
    };
    const done = {
      onSuccess: () => {
        toast({
          tone: 'success',
          title: editing ? t('assignments.saved') : t('assignments.created'),
        });
        onClose();
      },
    };
    if (editing) {
      update.mutate(
        { id: editing.id, changes: { ...input, keepFileIds: kept.map((file) => file.id) }, files },
        done,
      );
    } else {
      create.mutate({ input, files }, done);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? t('assignments.editTitle') : t('assignments.newTitle')}
      description={editing ? undefined : t('assignments.newHint')}
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button loading={pending} onClick={submit}>
            {editing ? t('groups.save') : t('assignments.create')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <TextField
          label={t('assignments.titleLabel')}
          hint={t('assignments.titleHint')}
          error={problems.title ? t('assignments.titleError') : undefined}
          maxLength={80}
          dir="auto"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setProblems((current) => ({ ...current, title: false }));
          }}
        />
        <TextArea
          label={t('assignments.instructions')}
          hint={t('assignments.instructionsHint')}
          optional
          rows={5}
          maxLength={ASSIGNMENT_TEXT_MAX_LENGTH}
          dir="auto"
          value={instructions}
          onChange={(event) => {
            setInstructions(event.target.value);
          }}
        />
        <RadioGroup<AssignmentKind>
          legend={t('assignments.kind')}
          name={`assignment-kind-${groupId}`}
          value={kind}
          onChange={setKind}
          options={ASSIGNMENT_KINDS.map((value) => ({
            value,
            label: t(`grades.kinds.${value}`),
          }))}
        />
        <div className={styles.formRow}>
          <TextField
            label={t('assignments.maxScore')}
            error={
              problems.maxScore
                ? t('assignments.maxScoreError', { max: GRADE_MAX_SCORE })
                : undefined
            }
            inputMode="decimal"
            dir="ltr"
            value={maxScore}
            onChange={(event) => {
              setMaxScore(event.target.value);
              setProblems((current) => ({ ...current, maxScore: false }));
            }}
          />
          <TextField
            label={t('assignments.dueAt')}
            hint={t('assignments.dueAtHint')}
            error={problems.dueAt ? t('assignments.dueAtError') : undefined}
            optional
            type="datetime-local"
            dir="ltr"
            value={dueAt}
            onChange={(event) => {
              setDueAt(event.target.value);
              setProblems((current) => ({ ...current, dueAt: false }));
            }}
          />
        </div>
        {dueAt && (
          <Checkbox
            label={t('assignments.allowLate')}
            hint={t('assignments.allowLateHint')}
            checked={allowLate}
            onChange={(event) => {
              setAllowLate(event.target.checked);
            }}
          />
        )}
        <FilePicker
          files={files}
          onChange={setFiles}
          kept={kept}
          onDropKept={(id) => {
            setKept((current) => current.filter((file) => file.id !== id));
          }}
          max={ASSIGNMENT_MAX_FILES}
          disabled={pending}
        />
        {failure && (
          <Alert tone="danger" live>
            {describeApiError(t, failure)}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
