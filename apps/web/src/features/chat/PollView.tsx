import { chatMessageResponseSchema, type ChatMessage, type Poll } from '@acu/shared';
import { ChartBarIcon, CheckCircleIcon, LockSimpleIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/toast/toast-context';
import { useFormatDate } from '../../i18n/use-format-date';
import { apiRequest } from '../../lib/api';
import { describeApiError } from '../auth/api-errors';
import styles from './Chat.module.css';

interface PollViewProps {
  groupId: string;
  poll: Poll;
  /** Voting is off in an archived group. */
  readOnly: boolean;
  onChanged: (message: ChatMessage) => void;
}

/** A poll inside its chat message: vote, change your mind, and watch the results move. */
export function PollView({ groupId, poll, readOnly, onChanged }: PollViewProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const formatDate = useFormatDate();
  const [pending, setPending] = useState<string | null>(null);
  const [showVoters, setShowVoters] = useState(false);
  // The closing time can pass while the chat is open; the server refuses late votes anyway.
  const closed = poll.closed || (poll.closesAt !== null && new Date(poll.closesAt) <= new Date());
  const locked = closed || readOnly;
  const total = poll.options.reduce((sum, option) => sum + option.votes, 0);

  const send = async (path: string, body: object | undefined, mark: string) => {
    setPending(mark);
    try {
      const { message } = await apiRequest(`/api/groups/${groupId}/polls/${poll.id}/${path}`, {
        method: 'POST',
        body,
        schema: chatMessageResponseSchema,
      });
      onChanged(message);
    } catch (error) {
      toast({ tone: 'danger', title: describeApiError(t, error) });
    } finally {
      setPending(null);
    }
  };

  const choose = (optionId: string) => {
    const chosen = poll.myVotes.includes(optionId);
    const optionIds = poll.multiple
      ? chosen
        ? poll.myVotes.filter((id) => id !== optionId)
        : [...poll.myVotes, optionId]
      : chosen
        ? []
        : [optionId];
    void send('vote', { optionIds }, optionId);
  };

  return (
    <div className={styles.poll}>
      <p className={styles.pollQuestion} dir="auto">
        <ChartBarIcon aria-hidden="true" />
        {poll.question}
      </p>
      <p className={styles.meta}>
        {poll.multiple ? t('poll.multiple') : t('poll.single')}
        {' · '}
        {poll.anonymous ? t('poll.anonymous') : t('poll.named')}
      </p>
      <ul className={styles.pollOptions}>
        {poll.options.map((option) => {
          const mine = poll.myVotes.includes(option.id);
          const share = total === 0 ? 0 : Math.round((option.votes / total) * 100);
          return (
            <li key={option.id}>
              <button
                type="button"
                className={styles.pollOption}
                aria-pressed={mine}
                disabled={locked || pending !== null}
                onClick={() => {
                  choose(option.id);
                }}
              >
                <span className={styles.pollBar} style={{ inlineSize: `${String(share)}%` }} />
                <span className={styles.pollText} dir="auto">
                  {mine && <CheckCircleIcon weight="fill" aria-hidden="true" />}
                  {option.text}
                </span>
                <span className={styles.pollCount}>
                  {t('poll.votes', { count: option.votes })} · {share}%
                </span>
              </button>
              {showVoters && option.voters.length > 0 && (
                <p className={styles.pollVoters} dir="auto">
                  {option.voters.map((voter) => voter.name).join('، ')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className={styles.pollFoot}>
        <span>{t('poll.voters', { count: poll.voters })}</span>
        {closed ? (
          <span className={styles.pollClosed}>
            <LockSimpleIcon aria-hidden="true" />
            {t('poll.closed')}
          </span>
        ) : (
          poll.closesAt && <span>{t('poll.closesAt', { date: formatDate(poll.closesAt) })}</span>
        )}
        {!poll.anonymous && total > 0 && (
          <button
            type="button"
            className={styles.pollLink}
            aria-expanded={showVoters}
            onClick={() => {
              setShowVoters((value) => !value);
            }}
          >
            {showVoters ? t('poll.hideVoters') : t('poll.showVoters')}
          </button>
        )}
        {poll.canClose && !closed && !readOnly && (
          <Button
            size="sm"
            variant="ghost"
            loading={pending === 'close'}
            onClick={() => {
              void send('close', undefined, 'close');
            }}
          >
            {t('poll.close')}
          </Button>
        )}
      </p>
    </div>
  );
}
