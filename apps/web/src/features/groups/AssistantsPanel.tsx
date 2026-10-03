import { addAssistantSchema, type Group } from '@acu/shared';
import { UserMinusIcon, UserPlusIcon } from '@phosphor-icons/react';
import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/toast/toast-context';
import { ApiError } from '../../lib/api';
import { describeApiError } from '../auth/api-errors';
import { Avatar } from '../auth/Avatar';
import { useAddAssistant, useAssistants, useRemoveAssistant } from './api';
import styles from './Groups.module.css';

/**
 * Teaching assistants: other doctor accounts that help run the group. They moderate the chat, post
 * announcements and keep the grades, but the group's settings and members stay with its doctor.
 */
export function AssistantsPanel({ group }: { group: Group }) {
  const { t } = useTranslation();
  const toast = useToast();
  const assistants = useAssistants(group.id);
  const add = useAddAssistant(group.id);
  const remove = useRemoveAssistant(group.id);
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = addAssistantSchema.safeParse({ email });
    if (!parsed.success) {
      setProblem(t('assistants.emailError'));
      return;
    }
    add.mutate(parsed.data.email, {
      onSuccess: (assistant) => {
        toast({ tone: 'success', title: t('assistants.added', { name: assistant.name }) });
        setEmail('');
        setProblem(null);
      },
      onError: (error) => {
        setProblem(
          error instanceof ApiError && error.code === 'ASSISTANT_NOT_FOUND'
            ? t('assistants.notFound')
            : error instanceof ApiError && error.code === 'ALREADY_ASSISTANT'
              ? t('assistants.already')
              : describeApiError(t, error),
        );
      },
    });
  };

  return (
    <div className={styles.assistants}>
      <p className={styles.muted}>{t('assistants.lead')}</p>
      {assistants.isPending && <Skeleton shape="block" blockSize="3rem" />}
      {assistants.data && assistants.data.length > 0 && (
        <ul className={styles.assistantList}>
          {assistants.data.map((assistant) => (
            <li key={assistant.id} className={styles.assistant}>
              <Link to={`/app/people/${assistant.id}`} className={styles.person}>
                <Avatar user={assistant} size="2.25rem" />
                <span className={styles.assistantText}>
                  <span className={styles.memberName}>{assistant.name}</span>
                  <span className={styles.muted} dir="ltr">
                    {assistant.email}
                  </span>
                </span>
              </Link>
              <Button
                size="sm"
                variant="ghost"
                iconStart={<UserMinusIcon aria-hidden="true" />}
                loading={remove.isPending && remove.variables === assistant.id}
                onClick={() => {
                  remove.mutate(assistant.id, {
                    onSuccess: () => {
                      toast({
                        tone: 'success',
                        title: t('assistants.removed', { name: assistant.name }),
                      });
                    },
                    onError: (error) => {
                      toast({ tone: 'danger', title: describeApiError(t, error) });
                    },
                  });
                }}
              >
                {t('assistants.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!group.archived && (
        <form className={styles.addForm} onSubmit={submit} noValidate>
          <TextField
            label={t('assistants.emailLabel')}
            hint={t('assistants.emailHint')}
            error={problem ?? undefined}
            type="email"
            dir="ltr"
            autoComplete="off"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setProblem(null);
            }}
          />
          <Button
            type="submit"
            variant="secondary"
            iconStart={<UserPlusIcon aria-hidden="true" />}
            loading={add.isPending}
          >
            {t('assistants.add')}
          </Button>
        </form>
      )}
    </div>
  );
}
