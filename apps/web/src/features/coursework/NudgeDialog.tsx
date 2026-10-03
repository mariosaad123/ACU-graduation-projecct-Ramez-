import {
  NUDGE_COOLDOWN_HOURS,
  NUDGE_NOTE_MAX_LENGTH,
  nudgeResponseSchema,
  type NudgeReason,
} from '@acu/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { TextArea } from '../../components/ui/TextArea';
import { useToast } from '../../components/ui/toast/toast-context';
import { apiRequest } from '../../lib/api';
import { describeApiError } from '../auth/api-errors';
import styles from './Coursework.module.css';

interface NudgeDialogProps {
  groupId: string;
  students: readonly { id: string; name: string }[];
  reason: NudgeReason;
  /** The announcement or assignment the reminder is about. */
  targetId?: string;
  onClose: () => void;
}

/**
 * Sends a reminder to one student or several, after showing who will get it. A note is optional:
 * without one the student reads the reason in their own language.
 */
export function NudgeDialog({ groupId, students, reason, targetId, onClose }: NudgeDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [note, setNote] = useState('');
  const send = useMutation({
    mutationFn: () =>
      apiRequest(`/api/groups/${groupId}/nudges`, {
        method: 'POST',
        body: {
          studentIds: students.map((student) => student.id),
          reason,
          targetId,
          note: note.trim() || undefined,
        },
        schema: nudgeResponseSchema,
      }),
    onSuccess: ({ sent, skipped }) => {
      toast({
        tone: sent > 0 ? 'success' : 'info',
        title:
          sent > 0 ? t('nudge.sent', { count: sent }) : t('nudge.noneSent', { count: skipped }),
        description:
          sent > 0 && skipped > 0
            ? t('nudge.skipped', { count: skipped, hours: NUDGE_COOLDOWN_HOURS })
            : undefined,
      });
      onClose();
    },
  });
  const names = students.slice(0, 6).map((student) => student.name);
  const more = students.length - names.length;

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('nudge.title', { count: students.length })}
      description={t(`nudge.reasons.${reason}`)}
      dismissOnBackdrop={!send.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={send.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={send.isPending}
            onClick={() => {
              send.mutate();
            }}
          >
            {t('nudge.send')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <p className={styles.recipients}>
          {names.join('، ')}
          {more > 0 && ` ${t('nudge.andMore', { count: more })}`}
        </p>
        <TextArea
          label={t('nudge.note')}
          hint={t('nudge.noteHint', { hours: NUDGE_COOLDOWN_HOURS })}
          optional
          rows={3}
          dir="auto"
          maxLength={NUDGE_NOTE_MAX_LENGTH}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
        {send.isError && (
          <Alert tone="danger" live>
            {describeApiError(t, send.error)}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
