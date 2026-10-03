import { isStaff, type ChatMessage, type GroupCapabilities, type GroupRole } from '@acu/shared';
import {
  ArrowBendUpLeftIcon,
  CopyIcon,
  DotsThreeIcon,
  PencilSimpleIcon,
  PushPinIcon,
  PushPinSlashIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { usePopover } from '../../components/ui/use-popover';
import { Avatar } from '../auth/Avatar';
import { AttachmentView } from './AttachmentView';
import { renderBody } from './mentions';
import { PollView } from './PollView';
import styles from './Chat.module.css';

export interface MessagePermissions {
  canPost: boolean;
  role: GroupRole;
  can: GroupCapabilities;
  archived: boolean;
}

/** The staff delete any message; a student moderator, those of students who are not moderators. */
function mayDelete(message: ChatMessage, permissions: MessagePermissions): boolean {
  if (message.mine) {
    return true;
  }
  const { role } = message.author;
  return (
    permissions.can.moderate &&
    (isStaff(permissions.role) || (!isStaff(role) && role !== 'moderator'))
  );
}

export interface MessageActions {
  onReply: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onPin: (message: ChatMessage, pinned: boolean) => void;
  onCopy: (message: ChatMessage) => void;
  onJumpTo: (messageId: string) => void;
  /** A poll's votes changed: the message comes back with its new results. */
  onChanged: (message: ChatMessage) => void;
}

function MessageMenu({
  message,
  permissions,
  actions,
}: {
  message: ChatMessage;
  permissions: MessagePermissions;
  actions: MessageActions;
}) {
  const { t } = useTranslation();
  const { open, close, toggle, panelId, containerRef, buttonRef, onKeyDown } = usePopover();
  // Near the bottom of the chat the menu opens upwards, so the list never cuts it off.
  const [above, setAbove] = useState(false);

  const items: { label: string; icon: ReactNode; run: () => void }[] = [];
  if (permissions.canPost) {
    items.push({
      label: t('chat.reply'),
      icon: <ArrowBendUpLeftIcon className="mirror-in-rtl" aria-hidden="true" />,
      run: () => {
        actions.onReply(message);
      },
    });
  }
  if (message.body) {
    items.push({
      label: t('chat.copy'),
      icon: <CopyIcon aria-hidden="true" />,
      run: () => {
        actions.onCopy(message);
      },
    });
  }
  if (message.mine && message.body !== null && permissions.canPost) {
    items.push({
      label: t('chat.edit'),
      icon: <PencilSimpleIcon aria-hidden="true" />,
      run: () => {
        actions.onEdit(message);
      },
    });
  }
  if (permissions.can.pin && !permissions.archived) {
    items.push({
      label: message.pinned ? t('chat.unpin') : t('chat.pin'),
      icon: message.pinned ? (
        <PushPinSlashIcon aria-hidden="true" />
      ) : (
        <PushPinIcon aria-hidden="true" />
      ),
      run: () => {
        actions.onPin(message, !message.pinned);
      },
    });
  }
  if (mayDelete(message, permissions)) {
    items.push({
      label: t('chat.delete'),
      icon: <TrashIcon aria-hidden="true" />,
      run: () => {
        actions.onDelete(message);
      },
    });
  }
  if (items.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className={styles.menu} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('chat.actions', { name: message.author.name })}
        onClick={(event) => {
          const button = event.currentTarget.getBoundingClientRect();
          const box = event.currentTarget.closest('[data-chat-list]')?.getBoundingClientRect();
          const needed = items.length * 44 + 16;
          setAbove(
            box !== undefined &&
              box.bottom - button.bottom < needed &&
              button.top - box.top > box.bottom - button.bottom,
          );
          toggle();
        }}
      >
        <DotsThreeIcon weight="bold" aria-hidden="true" />
      </button>
      <ul id={panelId} className={styles.menuPanel} data-above={above} hidden={!open}>
        {items.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                close();
                item.run();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One message in a group chat, with its author, attachment, quoted reply and actions. */
export function ChatMessageItem({
  groupId,
  message,
  continued,
  time,
  permissions,
  actions,
}: {
  groupId: string;
  message: ChatMessage;
  /** Same author as the message just above, moments later: the name and photo are not repeated. */
  continued: boolean;
  time: string;
  permissions: MessagePermissions;
  actions: MessageActions;
}) {
  const { t } = useTranslation();
  const { author } = message;

  return (
    <li
      id={`message-${message.id}`}
      className={clsx(styles.message, continued && styles.continued)}
      data-mine={message.mine}
      data-doctor={isStaff(author.role)}
      data-mention={message.mentionsMe}
    >
      <div className={styles.avatarSlot}>
        {!continued && (
          // The name below is the same link for screen readers; the photo is for the eye.
          <Link to={`/app/people/${author.id}`} tabIndex={-1} aria-hidden="true">
            <Avatar user={author} size="2.25rem" />
          </Link>
        )}
      </div>
      <div className={styles.bubble}>
        {!continued && (
          <p className={styles.author}>
            <Link
              to={`/app/people/${author.id}`}
              className={styles.authorName}
              title={t('chat.viewProfile', { name: author.name })}
            >
              {author.name}
            </Link>
            {author.role !== 'student' && (
              <span className={styles.doctorTag}>{t(`roles.${author.role}`)}</span>
            )}
          </p>
        )}
        {message.replyTo && (
          <button
            type="button"
            className={styles.quote}
            onClick={() => {
              if (message.replyTo) {
                actions.onJumpTo(message.replyTo.id);
              }
            }}
          >
            <span className={styles.quoteAuthor}>{message.replyTo.authorName}</span>
            <span className={styles.quoteText} dir="auto">
              {message.replyTo.excerpt?.replaceAll('@all', `@${t('chat.everyone')}`) ??
                (message.replyTo.hasAttachment
                  ? t('chat.quoteAttachment')
                  : t('chat.quoteDeleted'))}
            </span>
          </button>
        )}
        {message.deleted ? (
          <p className={styles.deleted}>{t('chat.deleted')}</p>
        ) : (
          <>
            {message.attachment && (
              <AttachmentView attachment={message.attachment} authorName={author.name} />
            )}
            {message.body && (
              <p className={styles.body} dir="auto">
                {renderBody(message.body, message.mentions, t('chat.everyone'))}
              </p>
            )}
            {message.poll && (
              <PollView
                groupId={groupId}
                poll={message.poll}
                readOnly={permissions.archived}
                onChanged={actions.onChanged}
              />
            )}
          </>
        )}
        <p className={styles.meta}>
          {message.pinned && (
            <PushPinIcon className={styles.pinMark} aria-label={t('chat.pinnedMark')} />
          )}
          <time dateTime={message.createdAt}>{time}</time>
          {message.edited && <span>· {t('chat.edited')}</span>}
        </p>
      </div>
      {!message.deleted && (
        <MessageMenu message={message} permissions={permissions} actions={actions} />
      )}
    </li>
  );
}
