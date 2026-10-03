import {
  QUICK_REACTIONS,
  UNCLEAR_REACTION,
  UNDERSTOOD_REACTION,
  chatMessageResponseSchema,
  isStaff,
  messageReactionsSchema,
  type ChatMessage,
} from '@acu/shared';
import { PlusIcon, SmileyIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LoadError } from '../../components/ui/LoadError';
import { Dialog } from '../../components/ui/Dialog';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toast/toast-context';
import { usePopover } from '../../components/ui/use-popover';
import { apiRequest } from '../../lib/api';
import { describeApiError } from '../auth/api-errors';
import { Avatar } from '../auth/Avatar';
import styles from './Reactions.module.css';

const EmojiPanel = lazy(() => import('./EmojiPanel'));

/**
 * Sends the reader's reaction to a message. Choosing the emoji they already chose takes it back,
 * as in any messenger. A failure is said in a toast and the message stays as it was.
 */
function useReact(
  groupId: string,
  message: ChatMessage,
  onChanged: (message: ChatMessage) => void,
) {
  const { t } = useTranslation();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const react = async (emoji: string) => {
    if (pending) {
      return;
    }
    const mine = message.reactions.find((reaction) => reaction.mine)?.emoji;
    setPending(true);
    try {
      const response = await apiRequest(`/api/groups/${groupId}/chat/${message.id}/reaction`, {
        method: 'PUT',
        body: { emoji: mine === emoji ? null : emoji },
        schema: chatMessageResponseSchema,
      });
      onChanged(response.message);
    } catch (error) {
      toast({ tone: 'danger', title: describeApiError(t, error) });
    } finally {
      setPending(false);
    }
  };
  return { react, pending };
}

/** What a reaction is called when it answers "did you follow?" on a message from the staff. */
function useUnderstandingLabel(message: ChatMessage) {
  const { t } = useTranslation();
  const fromStaff = isStaff(message.author.role);
  return (emoji: string): string | null => {
    if (!fromStaff) {
      return null;
    }
    if (emoji === UNDERSTOOD_REACTION) {
      return t('reactions.understood');
    }
    return emoji === UNCLEAR_REACTION ? t('reactions.unclear') : null;
  };
}

function ReactionsDialog({
  groupId,
  message,
  onClose,
}: {
  groupId: string;
  message: ChatMessage;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const labelOf = useUnderstandingLabel(message);
  const reactions = useQuery({
    // The counts on the message change with every reaction; so does this list.
    queryKey: ['group', groupId, 'reactions', message.id, message.version],
    queryFn: () =>
      apiRequest(`/api/groups/${groupId}/chat/${message.id}/reactions`, {
        schema: messageReactionsSchema,
      }),
  });

  return (
    <Dialog open onClose={onClose} title={t('reactions.whoTitle')}>
      {reactions.isPending && <Spinner size="2rem" />}
      {reactions.isError && (
        <LoadError
          error={reactions.error}
          retrying={reactions.isFetching}
          onRetry={() => {
            void reactions.refetch();
          }}
        />
      )}
      {reactions.data?.reactions.map((reaction) => (
        <section key={reaction.emoji} className={styles.whoGroup}>
          <h3 className={styles.whoHead}>
            <span className={styles.emoji}>{reaction.emoji}</span>
            {labelOf(reaction.emoji)}
            <span className={styles.whoCount}>{reaction.people.length}</span>
          </h3>
          <ul className={styles.whoList}>
            {reaction.people.map((person) => (
              <li key={person.id}>
                <Link to={`/app/people/${person.id}`} className={styles.whoPerson}>
                  <Avatar user={person} size="1.75rem" />
                  {person.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Dialog>
  );
}

interface ReactionProps {
  groupId: string;
  message: ChatMessage;
  /** Reactions are off in an archived group. */
  readOnly: boolean;
  onChanged: (message: ChatMessage) => void;
}

/** The reactions a message has, under it: press one to add yours to it or take it back. */
export function ReactionBar({ groupId, message, readOnly, onChanged }: ReactionProps) {
  const { t } = useTranslation();
  const { react, pending } = useReact(groupId, message, onChanged);
  const labelOf = useUnderstandingLabel(message);
  const [listing, setListing] = useState(false);
  if (message.reactions.length === 0) {
    return null;
  }
  const total = message.reactions.reduce((sum, reaction) => sum + reaction.count, 0);

  return (
    <div className={styles.bar}>
      {message.reactions.map((reaction) => {
        const label = labelOf(reaction.emoji);
        return (
          <button
            key={reaction.emoji}
            type="button"
            className={styles.chip}
            aria-pressed={reaction.mine}
            aria-label={t('reactions.chipLabel', {
              emoji: label ?? reaction.emoji,
              count: reaction.count,
            })}
            disabled={readOnly || pending}
            onClick={() => {
              void react(reaction.emoji);
            }}
          >
            <span className={styles.emoji} aria-hidden="true">
              {reaction.emoji}
            </span>
            {label && <span aria-hidden="true">{label}</span>}
            <span className={styles.chipCount} aria-hidden="true">
              {reaction.count}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        className={styles.who}
        onClick={() => {
          setListing(true);
        }}
      >
        {t('reactions.who', { count: total })}
      </button>
      {listing && (
        <ReactionsDialog
          groupId={groupId}
          message={message}
          onClose={() => {
            setListing(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * The button beside a message that opens the reactions: the usual six, the two answers to a
 * message from the staff, and a way to every other emoji.
 */
export function ReactionPicker({
  groupId,
  message,
  onChanged,
  className,
}: Omit<ReactionProps, 'readOnly'> & { className?: string }) {
  const { t } = useTranslation();
  const { open, close, toggle, panelId, containerRef, buttonRef, onKeyDown } = usePopover();
  const { react, pending } = useReact(groupId, message, onChanged);
  const [above, setAbove] = useState(false);
  const [full, setFull] = useState(false);
  const mine = message.reactions.find((reaction) => reaction.mine)?.emoji;
  const askUnderstanding = isStaff(message.author.role) && !message.mine;

  const choose = (emoji: string) => {
    close();
    setFull(false);
    void react(emoji);
  };

  return (
    <div ref={containerRef} className={className} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('reactions.add', { name: message.author.name })}
        disabled={pending}
        onClick={(event) => {
          const button = event.currentTarget.getBoundingClientRect();
          const box = event.currentTarget.closest('[data-chat-list]')?.getBoundingClientRect();
          setAbove(box !== undefined && box.bottom - button.bottom < 140);
          toggle();
        }}
      >
        <SmileyIcon aria-hidden="true" />
      </button>
      <div id={panelId} className={styles.popover} data-above={above} hidden={!open}>
        {askUnderstanding && (
          <div className={styles.understanding}>
            {[
              [UNDERSTOOD_REACTION, t('reactions.understood')],
              [UNCLEAR_REACTION, t('reactions.unclear')],
            ].map(([emoji = '', label]) => (
              <button
                key={emoji}
                type="button"
                className={styles.chip}
                aria-pressed={mine === emoji}
                onClick={() => {
                  choose(emoji);
                }}
              >
                <span className={styles.emoji} aria-hidden="true">
                  {emoji}
                </span>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className={styles.quick}>
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={styles.quickEmoji}
              aria-pressed={mine === emoji}
              aria-label={emoji}
              onClick={() => {
                choose(emoji);
              }}
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            className={styles.more}
            aria-label={t('reactions.more')}
            onClick={() => {
              close();
              setFull(true);
            }}
          >
            <PlusIcon aria-hidden="true" />
          </button>
        </div>
      </div>
      {full && (
        <Dialog
          open
          onClose={() => {
            setFull(false);
          }}
          title={t('reactions.more')}
        >
          <Suspense fallback={<Spinner size="2rem" />}>
            <EmojiPanel onPick={choose} />
          </Suspense>
        </Dialog>
      )}
    </div>
  );
}
