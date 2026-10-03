import {
  SCHEDULE_TIME_ZONE,
  chatMessageResponseSchema,
  type ChatMessage,
  type GroupView,
} from '@acu/shared';
import {
  ArrowDownIcon,
  CalendarDotsIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
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
import { useSearchParams } from 'react-router';
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
import { useGroupPeople } from '../people/api';
import { ChatComposer, type ComposerDraft } from './ChatComposer';
import { ChatMessageItem, type MessageActions } from './ChatMessageItem';
import { plainBody } from './mentions';
import { PinnedBar } from './PinnedBar';
import { PollDialog } from './PollDialog';
import { useChat } from './use-chat';
import styles from './Chat.module.css';

/** Messages from one author this close together read as one block. */
const CONTINUE_WITHIN_MS = 5 * 60 * 1000;
/** How near the bottom still counts as reading the latest messages. */
const NEAR_BOTTOM_PX = 120;
/** Older pages loaded, at most, to reach a pinned or quoted message. */
const JUMP_PAGES = 10;

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

/** "Sunday 10:00" in Cairo time, where the schedule is written; just the time when it is today. */
function useChangeLabel() {
  const { intlLocale } = useLocale();
  return useCallback(
    (iso: string) => {
      const at = new Date(iso);
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: SCHEDULE_TIME_ZONE });
      const today = day.format(at) === day.format(new Date());
      return new Intl.DateTimeFormat(intlLocale, {
        timeZone: SCHEDULE_TIME_ZONE,
        weekday: today ? undefined : 'long',
        hour: 'numeric',
        minute: '2-digit',
      }).format(at);
    },
    [intlLocale],
  );
}

/** The chat of a group, for its staff and its students alike; what each may do comes from the view. */
export function GroupChat({ view }: { view: GroupView }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { intlLocale } = useLocale();
  const dayLabel = useDayLabel();
  const changeLabel = useChangeLabel();
  const chat = useChat(view.id);
  const people = useGroupPeople(view.id);
  const toggleChat = useUpdateGroup(view.id);
  const [search, setSearch] = useSearchParams();
  const list = useRef<HTMLDivElement>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [deleting, setDeleting] = useState<ChatMessage | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [asking, setAsking] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  // The "new messages" line stays where it was when the chat was opened.
  const [unreadFrom] = useState(view.chat.lastReadSeq);
  const lastMarked = useRef(view.chat.lastReadSeq);
  const scrolledOnce = useRef(false);

  const permissions = {
    canPost: view.chat.canPost,
    role: view.role,
    can: view.can,
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

  const { hasOlder, loadOlder } = chat;
  /** Goes to a message, loading older pages first when it is further back than what is shown. */
  const jumpTo = useCallback(
    async (messageId: string) => {
      let target = document.getElementById(`message-${messageId}`);
      let more = hasOlder;
      for (let page = 0; !target && more && page < JUMP_PAGES; page += 1) {
        more = await loadOlder();
        // The older messages are in the page after the next paint.
        await new Promise((resolve) => requestAnimationFrame(resolve));
        target = document.getElementById(`message-${messageId}`);
      }
      if (target && list.current) {
        scrollListTo(list.current, target, 'center', 'smooth');
        target.classList.add(styles.highlight ?? '');
        const found = target;
        window.setTimeout(() => {
          found.classList.remove(styles.highlight ?? '');
        }, 1600);
      }
    },
    [hasOlder, loadOlder],
  );

  // First view: the first unread message, or the bottom. Later: follow new messages while at the bottom.
  const newest = chat.messages.at(-1);
  const wanted = search.get('message');
  useLayoutEffect(() => {
    if (chat.status !== 'ready') {
      return;
    }
    if (!scrolledOnce.current) {
      scrolledOnce.current = true;
      // A notification leads to one message: that one, rather than the first unread.
      if (wanted) {
        void jumpTo(wanted);
        return;
      }
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

  // The address keeps ?message= only until that message has been shown.
  useEffect(() => {
    if (chat.status === 'ready' && wanted) {
      setSearch(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('message');
          return next;
        },
        { replace: true },
      );
    }
  }, [chat.status, wanted, setSearch]);

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

  const setPinned = (message: ChatMessage, pinned: boolean) => {
    void change(
      apiRequest(`/api/groups/${view.id}/chat/${message.id}/${pinned ? 'pin' : 'unpin'}`, {
        method: 'POST',
        schema: chatMessageResponseSchema,
      }),
    );
  };

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
    onPin: setPinned,
    onCopy: (message) => {
      const text = plainBody(message.body ?? '', message.mentions, t('chat.everyone'));
      void copyText(text).then((copied) => {
        if (copied) {
          toast({ tone: 'success', title: t('chat.copied') });
        }
      });
    },
    onJumpTo: (messageId) => {
      void jumpTo(messageId);
    },
    onChanged: chat.apply,
  };

  // One line marks where unread messages start, before the first one someone else wrote.
  const firstUnreadId = chat.messages.find(
    (message) => message.seq > unreadFrom && !message.mine,
  )?.id;

  const { open, mode, nextChange, manual } = view.chat;
  const when = nextChange ? changeLabel(nextChange.at) : null;
  const status =
    mode === 'scheduled' && when
      ? open
        ? t('chat.openUntil', { when })
        : t('chat.opensAt', { when })
      : open
        ? t('chat.open')
        : t('chat.closed');
  const notice = view.archived
    ? t('chat.archivedNotice')
    : view.chat.muted
      ? t('chat.mutedNotice')
      : !open
        ? mode === 'scheduled' && when
          ? t('chat.closedUntilNotice', { when })
          : t('chat.closedNotice')
        : null;

  return (
    <section className={styles.chat} aria-labelledby={`chat-${view.id}`}>
      <header className={styles.chatHead}>
        <h2 id={`chat-${view.id}`} className={styles.chatTitle}>
          {t('chat.title')}
        </h2>
        <Badge
          tone={open ? 'success' : 'warning'}
          icon={mode === 'scheduled' ? <CalendarDotsIcon aria-hidden="true" /> : undefined}
        >
          {status}
        </Badge>
        {manual && <Badge>{t('chat.manual')}</Badge>}
        {view.can.manage && !view.archived && (
          <Button
            size="sm"
            variant="secondary"
            className={styles.chatToggle}
            loading={toggleChat.isPending}
            iconStart={
              open ? (
                <LockSimpleIcon aria-hidden="true" />
              ) : (
                <LockSimpleOpenIcon aria-hidden="true" />
              )
            }
            onClick={() => {
              toggleChat.mutate(
                { chatOpen: !open },
                {
                  onSuccess: () => {
                    toast({
                      tone: 'success',
                      title: open ? t('chat.closedDone') : t('chat.openedDone'),
                    });
                  },
                  onError: (error) => {
                    toast({ tone: 'danger', title: describeApiError(t, error) });
                  },
                },
              );
            }}
          >
            {open ? t('chat.closeChat') : t('chat.openChat')}
          </Button>
        )}
      </header>

      {chat.pinned.length > 0 && (
        <PinnedBar
          pinned={chat.pinned}
          canUnpin={view.can.pin && !view.archived}
          onJump={(messageId) => {
            void jumpTo(messageId);
          }}
          onUnpin={(message) => {
            setPinned(message, false);
          }}
        />
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
            <p className={styles.empty}>{open ? t('chat.empty') : t('chat.emptyAnnouncements')}</p>
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
                    groupId={view.id}
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
          people={people.data ?? []}
          canMentionAll={view.can.mentionAll}
          onCreatePoll={
            view.can.createPolls
              ? () => {
                  setAsking(true);
                }
              : undefined
          }
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

      {asking && (
        <PollDialog
          groupId={view.id}
          onClose={() => {
            setAsking(false);
          }}
          onCreated={(message) => {
            chat.apply(message);
            lastMarked.current = Math.max(lastMarked.current, message.seq);
          }}
        />
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
