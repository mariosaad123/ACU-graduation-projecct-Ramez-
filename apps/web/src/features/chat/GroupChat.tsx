import { chatMessageResponseSchema, type ChatMessage, type GroupView } from '@acu/shared';
import {
  ArrowDownIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  PushPinIcon,
} from '@phosphor-icons/react';
import { useMutation } from '@tanstack/react-query';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toast/toast-context';
import { useFormatDate } from '../../i18n/use-format-date';
import { useLocale } from '../../i18n/use-locale';
import { apiRequest } from '../../lib/api';
import { copyText } from '../../lib/clipboard';
import { describeApiError } from '../auth/api-errors';
import { useUpdateGroup } from '../groups/api';
import { ChatComposer, type ComposerDraft } from './ChatComposer';
import { ChatMessageItem, type MessageActions } from './ChatMessageItem';
import { useChat } from './use-chat';
import styles from './Chat.module.css';

/** Messages from one author this close together read as one block. */
const CONTINUE_WITHIN_MS = 5 * 60 * 1000;
/** How near the bottom still counts as reading the latest messages. */
const NEAR_BOTTOM_PX = 120;

/** Scrolls the message list, and only the list, so a message sits at its top or middle. */
function scrollListTo(
  box: HTMLElement,
  target: HTMLElement,
  where: 'start' | 'center',
  behavior: ScrollBehavior = 'auto',
) {
  const offset = target.getBoundingClientRect().top - box.getBoundingClientRect().top;
  const shift = where === 'center' ? (box.clientHeight - target.offsetHeight) / 2 : 0;
  box.scrollTo({ top: box.scrollTop + offset - Math.max(shift, 0), behavior });
}

function nearBottom(box: HTMLElement): boolean {
  return box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_BOTTOM_PX;
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getFullYear())}-${String(date.getMonth())}-${String(date.getDate())}`;
}

function useDayLabel() {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  return (iso: string) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (dayKey(iso) === dayKey(today.toISOString())) {
      return t('chat.today');
    }
    if (dayKey(iso) === dayKey(yesterday.toISOString())) {
      return t('chat.yesterday');
    }
    return formatDate(iso);
  };
}

/** The chat of a group, for its doctor and its students alike; what each may do comes from the view. */
export function GroupChat({ view }: { view: GroupView }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { intlLocale } = useLocale();
  const dayLabel = useDayLabel();
  const chat = useChat(view.id);
  const toggleChat = useUpdateGroup(view.id);
  const list = useRef<HTMLDivElement>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [deleting, setDeleting] = useState<ChatMessage | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  // The "new messages" line stays where it was when the chat was opened.
  const [unreadFrom] = useState(view.chat.lastReadSeq);
  const lastMarked = useRef(view.chat.lastReadSeq);
  const scrolledOnce = useRef(false);

  const permissions = {
    canPost: view.chat.canPost,
    isDoctor: view.isDoctor,
    archived: view.archived,
  };
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(intlLocale, { hour: 'numeric', minute: '2-digit' }),
    [intlLocale],
  );

  const send = useMutation({
    mutationFn: async (draft: ComposerDraft) => {
      const form = new FormData();
      if (draft.body) {
        form.append('body', draft.body);
      }
      if (draft.replyToId) {
        form.append('replyToId', draft.replyToId);
      }
      if (draft.file) {
        form.append('file', draft.file, draft.file.name);
      }
      return (
        await apiRequest(`/api/groups/${view.id}/chat`, {
          method: 'POST',
          body: form,
          schema: chatMessageResponseSchema,
        })
      ).message;
    },
    onSuccess: (message) => {
      chat.apply(message);
      lastMarked.current = Math.max(lastMarked.current, message.seq);
    },
  });

  const change = useCallback(
    async (request: Promise<{ message: ChatMessage }>) => {
      try {
        chat.apply((await request).message);
        return true;
      } catch (error) {
        toast({ tone: 'danger', title: describeApiError(t, error) });
        return false;
      }
    },
    [chat, t, toast],
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const box = list.current;
    if (box) {
      box.scrollTo({ top: box.scrollHeight, behavior });
    }
  }, []);

  const jumpTo = useCallback((messageId: string) => {
    const target = document.getElementById(`message-${messageId}`);
    if (target && list.current) {
      scrollListTo(list.current, target, 'center', 'smooth');
      target.classList.add(styles.highlight ?? '');
      window.setTimeout(() => {
        target.classList.remove(styles.highlight ?? '');
      }, 1600);
    }
  }, []);

  // First view: the first unread message, or the bottom. Later: follow new messages while at the bottom.
  const newest = chat.messages.at(-1);
  useLayoutEffect(() => {
    if (chat.status !== 'ready') {
      return;
    }
    if (!scrolledOnce.current) {
      scrolledOnce.current = true;
      const firstUnread = chat.messages.find(
        (message) => message.seq > unreadFrom && !message.mine,
      );
      const target = firstUnread && document.getElementById(`message-${firstUnread.id}`);
      if (target && list.current) {
        // The "new messages" line sits just above the first unread message.
        scrollListTo(list.current, target, 'start');
        list.current.scrollTop -= 48;
      } else {
        scrollToBottom();
      }
      return;
    }
    // At once rather than animated: an animation can be cut short and leave the reader above it.
    if (atBottom || newest?.mine) {
      scrollToBottom();
    }
    // Only a new message at the end should move the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.status, newest?.id]);

  // Reading the bottom of the chat marks everything up to the newest message as read.
  useEffect(() => {
    // Measured, not remembered: the first view may open on the first unread message instead.
    const box = list.current;
    if (!box || !nearBottom(box) || !newest || newest.seq <= lastMarked.current) {
      return;
    }
    if (document.visibilityState !== 'visible') {
      return;
    }
    lastMarked.current = newest.seq;
    void apiRequest(`/api/groups/${view.id}/chat/read`, {
      method: 'POST',
      body: { seq: newest.seq },
    }).catch(() => {
      // Unread counts catch up at the next read; nothing to tell the reader.
      lastMarked.current = 0;
    });
  }, [atBottom, newest, view.id]);

  const actions: MessageActions = {
    onReply: (message) => {
      setEditing(null);
      setReplyTo(message);
    },
    onEdit: (message) => {
      setReplyTo(null);
      setEditing(message);
    },
    onDelete: setDeleting,
    onPin: (message, pinned) => {
      void change(
        apiRequest(`/api/groups/${view.id}/chat/${message.id}/${pinned ? 'pin' : 'unpin'}`, {
          method: 'POST',
          schema: chatMessageResponseSchema,
        }),
      );
    },
    onCopy: (message) => {
      void copyText(message.body ?? '').then((copied) => {
        if (copied) {
          toast({ tone: 'success', title: t('chat.copied') });
        }
      });
    },
    onJumpTo: jumpTo,
  };

  // One line marks where unread messages start, before the first one someone else wrote.
  const firstUnreadId = chat.messages.find(
    (message) => message.seq > unreadFrom && !message.mine,
  )?.id;

  const closedToStudents = !view.chat.open;
  const notice = view.archived
    ? t('chat.archivedNotice')
    : !view.isDoctor && view.chat.muted
      ? t('chat.mutedNotice')
      : !view.isDoctor && closedToStudents
        ? t('chat.closedNotice')
        : null;

  return (
    <section className={styles.chat} aria-labelledby={`chat-${view.id}`}>
      <header className={styles.chatHead}>
        <h2 id={`chat-${view.id}`} className={styles.chatTitle}>
          {t('chat.title')}
        </h2>
        <Badge tone={closedToStudents ? 'warning' : 'success'}>
          {closedToStudents ? t('chat.closed') : t('chat.open')}
        </Badge>
        {view.isDoctor && !view.archived && (
          <Button
            size="sm"
            variant="secondary"
            className={styles.chatToggle}
            loading={toggleChat.isPending}
            iconStart={
              closedToStudents ? (
                <LockSimpleOpenIcon aria-hidden="true" />
              ) : (
                <LockSimpleIcon aria-hidden="true" />
              )
            }
            onClick={() => {
              toggleChat.mutate(
                { chatOpen: closedToStudents },
                {
                  onSuccess: () => {
                    toast({
                      tone: 'success',
                      title: closedToStudents ? t('chat.openedDone') : t('chat.closedDone'),
                    });
                  },
                  onError: (error) => {
                    toast({ tone: 'danger', title: describeApiError(t, error) });
                  },
                },
              );
            }}
          >
            {closedToStudents ? t('chat.openChat') : t('chat.closeChat')}
          </Button>
        )}
      </header>

      {chat.pinned.length > 0 && (
        <details className={styles.pinned}>
          <summary>
            <PushPinIcon aria-hidden="true" />
            {t('chat.pinned', { count: chat.pinned.length })}
            <span className={styles.pinnedPreview} dir="auto">
              {chat.pinned[0]?.body ?? t('chat.quoteAttachment')}
            </span>
          </summary>
          <ul className={styles.pinnedList}>
            {chat.pinned.map((message) => (
              <li key={message.id}>
                <button
                  type="button"
                  className={styles.pinnedItem}
                  onClick={() => {
                    jumpTo(message.id);
                  }}
                >
                  <span className={styles.quoteAuthor}>{message.author.name}</span>
                  <span dir="auto">{message.body ?? t('chat.quoteAttachment')}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className={styles.viewport}>
        <div
          ref={list}
          className={styles.list}
          data-chat-list
          aria-busy={chat.status === 'loading'}
          onScroll={(event) => {
            setAtBottom(nearBottom(event.currentTarget));
          }}
        >
          {chat.status === 'loading' && <Spinner size="2rem" className={styles.loading} />}
          {chat.status === 'failed' && (
            <Alert tone="danger" live>
              {describeApiError(t, chat.error) || t('chat.loadFailed')}
            </Alert>
          )}
          {chat.status === 'ready' && chat.hasOlder && (
            <Button
              variant="ghost"
              size="sm"
              className={styles.older}
              onClick={() => {
                void chat.loadOlder();
              }}
            >
              {t('chat.loadOlder')}
            </Button>
          )}
          {chat.status === 'ready' && chat.messages.length === 0 && (
            <p className={styles.empty}>
              {closedToStudents ? t('chat.emptyAnnouncements') : t('chat.empty')}
            </p>
          )}
          <ol className={styles.messages} aria-live="polite" aria-relevant="additions">
            {chat.messages.map((message, index) => {
              const previous = chat.messages[index - 1];
              const newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
              const firstUnread = message.id === firstUnreadId;
              const continued =
                !newDay &&
                !firstUnread &&
                previous.author.id === message.author.id &&
                new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
                  CONTINUE_WITHIN_MS;
              return (
                <Fragment key={message.id}>
                  {newDay && (
                    <li className={styles.day} role="separator">
                      <span>{dayLabel(message.createdAt)}</span>
                    </li>
                  )}
                  {firstUnread && (
                    <li className={styles.unreadLine} role="separator">
                      <span>{t('chat.newMessages')}</span>
                    </li>
                  )}
                  <ChatMessageItem
                    message={message}
                    continued={continued}
                    time={timeFormat.format(new Date(message.createdAt))}
                    permissions={permissions}
                    actions={actions}
                  />
                </Fragment>
              );
            })}
          </ol>
        </div>

        {!atBottom && chat.messages.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            className={styles.jump}
            iconStart={<ArrowDownIcon aria-hidden="true" />}
            onClick={() => {
              scrollToBottom('smooth');
            }}
          >
            {t('chat.jumpToLatest')}
          </Button>
        )}
      </div>

      {view.chat.canPost ? (
        <ChatComposer
          key={editing?.id ?? 'new'}
          replyTo={replyTo}
          editing={editing}
          sending={send.isPending}
          error={send.isError ? describeApiError(t, send.error) : null}
          onSend={async (draft) => {
            try {
              await send.mutateAsync(draft);
              setReplyTo(null);
              return true;
            } catch {
              return false;
            }
          }}
          onSaveEdit={async (message, body) => {
            const saved = await change(
              apiRequest(`/api/groups/${view.id}/chat/${message.id}`, {
                method: 'PATCH',
                body: { body },
                schema: chatMessageResponseSchema,
              }),
            );
            if (saved) {
              setEditing(null);
            }
            return saved;
          }}
          onCancelReply={() => {
            setReplyTo(null);
          }}
          onCancelEdit={() => {
            setEditing(null);
          }}
        />
      ) : (
        notice && <p className={styles.notice}>{notice}</p>
      )}

      <ConfirmDialog
        open={deleting !== null}
        danger
        title={t('chat.deleteTitle')}
        description={t('chat.deleteBody')}
        confirmLabel={t('chat.deleteConfirm')}
        pending={deletePending}
        onClose={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (!deleting || deletePending) {
            return;
          }
          setDeletePending(true);
          void change(
            apiRequest(`/api/groups/${view.id}/chat/${deleting.id}`, {
              method: 'DELETE',
              schema: chatMessageResponseSchema,
            }),
          ).then(() => {
            setDeletePending(false);
            setDeleting(null);
          });
        }}
      />
    </section>
  );
}
