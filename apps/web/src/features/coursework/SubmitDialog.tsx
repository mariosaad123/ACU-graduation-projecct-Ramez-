import { ASSIGNMENT_TEXT_MAX_LENGTH, SUBMISSION_MAX_FILES, type Assignment } from '@acu/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { TextArea } from '../../components/ui/TextArea';
import { useToast } from '../../components/ui/toast/toast-context';
import { describeApiError } from '../auth/api-errors';
import { useSubmitWork } from './api';
import { FilePicker } from './FilePicker';
import styles from './Coursework.module.css';

/**
 * A student hands in their work, or changes what they handed in. If sending fails, what they
 * wrote and chose stays in place for another try.
 */
export function SubmitDialog({
  groupId,
  assignment,
  onClose,
}: {
  groupId: string;
  assignment: Assignment;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const submit = useSubmitWork(groupId);
  const previous = assignment.mine?.submission ?? null;
  const [body, setBody] = useState(previous?.body ?? '');
  const [kept, setKept] = useState(previous?.files ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [empty, setEmpty] = useState(false);
  const late = assignment.dueAt !== null && new Date(assignment.dueAt) < new Date();

  const send = () => {
    if (body.trim() === '' && kept.length + files.length === 0) {
      setEmpty(true);
      return;
    }
    submit.mutate(
      { id: assignment.id, body: body.trim(), keepFileIds: kept.map((file) => file.id), files },
      {
        onSuccess: () => {
          toast({
            tone: 'success',
            title: previous ? t('assignments.resubmitted') : t('assignments.submitted'),
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
      title={previous ? t('assignments.editWork') : t('assignments.handIn')}
      description={assignment.title}
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.isPending}>
            {t('common.cancel')}
          </Button>
          <Button loading={submit.isPending} onClick={send}>
            {previous ? t('assignments.saveWork') : t('assignments.handIn')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {late && <Alert tone="warning">{t('assignments.lateWarning')}</Alert>}
        <TextArea
          label={t('assignments.answer')}
          hint={t('assignments.answerHint')}
          error={empty ? t('assignments.emptyWork') : undefined}
          optional
          rows={7}
          maxLength={ASSIGNMENT_TEXT_MAX_LENGTH}
          dir="auto"
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setEmpty(false);
          }}
        />
        <FilePicker
          files={files}
          onChange={(next) => {
            setFiles(next);
            setEmpty(false);
          }}
          kept={kept}
          onDropKept={(id) => {
            setKept((current) => current.filter((file) => file.id !== id));
          }}
          max={SUBMISSION_MAX_FILES}
          disabled={submit.isPending}
        />
        {submit.isError && (
          <Alert tone="danger" live>
            {describeApiError(t, submit.error)}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
