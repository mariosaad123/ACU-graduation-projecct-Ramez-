import {
  POLL_MAX_OPTIONS,
  chatMessageResponseSchema,
  createPollSchema,
  type ChatMessage,
} from '@acu/shared';
import { PlusIcon, XIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Dialog } from '../../components/ui/Dialog';
import { IconButton } from '../../components/ui/IconButton';
import { TextArea } from '../../components/ui/TextArea';
import { TextField } from '../../components/ui/TextField';
import { apiRequest } from '../../lib/api';
import { describeApiError } from '../auth/api-errors';
import styles from './Chat.module.css';

interface PollDialogProps {
  groupId: string;
  onClose: () => void;
  onCreated: (message: ChatMessage) => void;
}

/** Writes a poll: a question, two to ten options, and how people may answer. */
export function PollDialog({ groupId, onClose, onCreated }: PollDialogProps) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [closesAt, setClosesAt] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const filled = options.map((option) => option.trim()).filter(Boolean);
    const closing = closesAt ? new Date(closesAt) : null;
    if (closing && closing <= new Date()) {
      setProblem(t('poll.errorPast'));
      return;
    }
    const parsed = createPollSchema.safeParse({
      question,
      options: filled,
      multiple,
      anonymous,
      closesAt: closing ? closing.toISOString() : null,
    });
    if (!parsed.success) {
      const repeated = parsed.error.issues.some((issue) => issue.path[0] === 'options');
      setProblem(
        !question.trim()
          ? t('poll.errorQuestion')
          : filled.length < 2
            ? t('poll.errorOptions')
            : repeated
              ? t('poll.errorRepeated')
              : t('poll.errorQuestion'),
      );
      return;
    }
    setPending(true);
    setProblem(null);
    try {
      const { message } = await apiRequest(`/api/groups/${groupId}/polls`, {
        method: 'POST',
        body: parsed.data,
        schema: chatMessageResponseSchema,
      });
      onCreated(message);
      onClose();
    } catch (error) {
      setProblem(describeApiError(t, error));
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('poll.createTitle')}
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={pending}
            onClick={() => {
              void submit();
            }}
          >
            {t('poll.create')}
          </Button>
        </>
      }
    >
      <div className={styles.pollForm}>
        <TextArea
          label={t('poll.question')}
          rows={2}
          maxLength={300}
          dir="auto"
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
            setProblem(null);
          }}
        />
        <fieldset className={styles.pollFields}>
          <legend>{t('poll.options')}</legend>
          {options.map((option, index) => (
            // The inputs keep their place while being typed in: the index is their identity.
            <div key={index} className={styles.pollFieldRow}>
              <TextField
                label={t('poll.option', { number: index + 1 })}
                maxLength={100}
                dir="auto"
                optional={index >= 2}
                value={option}
                onChange={(event) => {
                  setOptions((current) =>
                    current.map((value, position) =>
                      position === index ? event.target.value : value,
                    ),
                  );
                  setProblem(null);
                }}
              />
              {options.length > 2 && (
                <IconButton
                  size="sm"
                  label={t('poll.removeOption', { number: index + 1 })}
                  icon={<XIcon />}
                  onClick={() => {
                    setOptions((current) => current.filter((_, position) => position !== index));
                  }}
                />
              )}
            </div>
          ))}
          {options.length < POLL_MAX_OPTIONS && (
            <Button
              variant="ghost"
              size="sm"
              iconStart={<PlusIcon aria-hidden="true" />}
              onClick={() => {
                setOptions((current) => [...current, '']);
              }}
            >
              {t('poll.addOption')}
            </Button>
          )}
        </fieldset>
        <Checkbox
          label={t('poll.allowMultiple')}
          checked={multiple}
          onChange={(event) => {
            setMultiple(event.target.checked);
          }}
        />
        <Checkbox
          label={t('poll.makeAnonymous')}
          hint={t('poll.makeAnonymousHint')}
          checked={anonymous}
          onChange={(event) => {
            setAnonymous(event.target.checked);
          }}
        />
        <TextField
          label={t('poll.closesAtLabel')}
          hint={t('poll.closesAtHint')}
          type="datetime-local"
          optional
          value={closesAt}
          onChange={(event) => {
            setClosesAt(event.target.value);
            setProblem(null);
          }}
        />
        {problem && (
          <Alert tone="danger" live>
            {problem}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
