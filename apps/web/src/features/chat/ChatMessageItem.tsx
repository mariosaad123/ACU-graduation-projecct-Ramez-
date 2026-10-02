import type { Attachment, ChatMessage } from '@acu/shared';
import {
  ArrowBendUpLeftIcon,
  CopyIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  FileIcon,
  FilePdfIcon,
  PencilSimpleIcon,
  PushPinIcon,
  PushPinSlashIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import clsx from 'clsx';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AudioPlayer } from '../../components/media/AudioPlayer';
import { usePopover } from '../../components/ui/use-popover';
import { useLocale } from '../../i18n/use-locale';
import { Avatar } from '../auth/Avatar';
import { linkify } from './linkify';
import styles from './Chat.module.css';

export interface MessagePermissions {
  canPost: boolean;
  isDoctor: boolean;
  archived: boolean;
}

export interface MessageActions {
  onReply: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onPin: (message: ChatMessage, pinned: boolean) => void;
  onCopy: (message: ChatMessage) => void;
  onJumpTo: (messageId: string) => void;
}

function useFormatSize() {
  const { intlLocale } = useLocale();
  return useMemo(() => {
    const kilobytes = new Intl.NumberFormat(intlLocale, {
      style: 'unit',
      unit: 'kilobyte',
      maximumFractionDigits: 0,
    });
    const megabytes = new Intl.NumberFormat(intlLocale, {
      style: 'unit',
      unit: 'megabyte',
      maximumFractionDigits: 1,
    });
    return (bytes: number) =>
      bytes < 1024 * 1024
        ? kilobytes.format(Math.max(1, Math.round(bytes / 1024)))
        : megabytes.format(bytes / (1024 * 1024));
  }, [intlLocale]);
}

/** The tallest an image may be in the chat, in rem. */
const IMAGE_MAX_REM = 20;

/**
 * Reserves the image's exact box before it loads, so the chat does not jump (and lose its place
 * at the bottom) when it arrives. Tall images are narrowed rather than cropped.
 */
function imageBox({ width, height }: Attachment): CSSProperties | undefined {
  if (!width || !height) {
    return undefined;
  }
  return {
    aspectRatio: `${String(width)} / ${String(height)}`,
    inlineSize: `min(100%, ${String(width)}px, ${String((IMAGE_MAX_REM * width) / height)}rem)`,
  };
}

function AttachmentView({
  attachment,
  authorName,
}: {
  attachment: Attachment;
  authorName: string;
}) {
  const { t } = useTranslation();
  const formatSize = useFormatSize();

  if (attachment.kind === 'image') {
    return (
      <a href={attachment.url} target="_blank" rel="noopener" className={styles.imageLink}>
        <img
          className={styles.image}
          src={attachment.url}
          alt={t('chat.photoAlt', { name: authorName })}
          width={attachment.width ?? undefined}
          height={attachment.height ?? undefined}
          style={imageBox(attachment)}
          loading="lazy"
        />
      </a>
    );
  }
  if (attachment.kind === 'audio') {
    return <AudioPlayer src={attachment.url} title={t('chat.voice')} className={styles.audio} />;
  }
  const name = attachment.name ?? t('chat.document');
  const Icon = attachment.contentType === 'application/pdf' ? FilePdfIcon : FileIcon;
  return (
    <a
      href={attachment.url}
      download={name}
      className={styles.document}
      aria-label={t('chat.download', { name })}
    >
      <Icon className={styles.documentIcon} aria-hidden="true" />
      <span className={styles.documentText}>
        <span className={styles.documentName} dir="auto">
          {name}
        </span>
        <span className={styles.meta}>{formatSize(attachment.size)}</span>
      </span>
      <DownloadSimpleIcon aria-hidden="true" />
    </a>
  );
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
  if (permissions.isDoctor && !permissions.archived) {
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
  if (message.mine || permissions.isDoctor) {
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
  message,
  continued,
  time,
  permissions,
  actions,
}: {
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
      data-doctor={author.isDoctor}
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
            {author.isDoctor && <span className={styles.doctorTag}>{t('chat.doctor')}</span>}
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
              {message.replyTo.excerpt ??
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
                {linkify(message.body)}
              </p>
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
