import type { ChatMessage } from '@acu/shared';
import { CaretDownIcon, PushPinIcon, PushPinSlashIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../../components/ui/IconButton';
import { plainBody } from './mentions';
import styles from './Chat.module.css';

interface PinnedBarProps {
  /** Newest pin first. */
  pinned: readonly ChatMessage[];
  canUnpin: boolean;
  onJump: (messageId: string) => void;
  onUnpin: (message: ChatMessage) => void;
}

/** What a pinned message says in one line: its text, its poll's question, or what is attached. */
function usePreview() {
  const { t } = useTranslation();
  return (message: ChatMessage) => {
    if (message.body) {
      return plainBody(message.body, message.mentions, t('chat.everyone'));
    }
    if (message.poll) {
      return message.poll.question;
    }
    return message.attachment
      ? (message.attachment.name ?? t(`files.kinds.${message.attachment.kind}`))
      : t('chat.quoteAttachment');
  };
}

/**
 * The pinned messages as one bar above the chat. A press goes to the message shown and moves the
 * bar on to the next pin, so repeated presses walk through them all; the marks on the side show
 * which one is up. The arrow opens the whole list.
 */
export function PinnedBar({ pinned, canUnpin, onJump, onUnpin }: PinnedBarProps) {
  const { t } = useTranslation();
  const preview = usePreview();
  const [position, setPosition] = useState(0);
  const [listed, setListed] = useState(false);
  // Pins come and go while the bar is up.
  const index = position % pinned.length;
  const current = pinned[index];
  if (!current) {
    return null;
  }

  return (
    <div className={styles.pinned}>
      <div className={styles.pinnedRow}>
        <button
          type="button"
          className={styles.pinnedMain}
          aria-label={t('chat.pinnedGo', { current: index + 1, total: pinned.length })}
          onClick={() => {
            onJump(current.id);
            setPosition(index + 1);
          }}
        >
          {pinned.length > 1 && (
            <span className={styles.pinnedMarks} aria-hidden="true">
              {pinned.slice(0, 5).map((message, mark) => (
                <span key={message.id} data-current={mark === Math.min(index, 4)} />
              ))}
            </span>
          )}
          <PushPinIcon weight="fill" className={styles.pinnedIcon} aria-hidden="true" />
          <span className={styles.pinnedText}>
            <span className={styles.pinnedLabel}>
              {pinned.length > 1
                ? t('chat.pinnedOf', { current: index + 1, total: pinned.length })
                : t('chat.pinnedOne')}
              {' · '}
              {current.author.name}
            </span>
            <span className={styles.pinnedPreview} dir="auto">
              {preview(current)}
            </span>
          </span>
          {current.attachment?.kind === 'image' && (
            <img className={styles.pinnedThumb} src={current.attachment.url} alt="" />
          )}
        </button>
        {(pinned.length > 1 || canUnpin) && (
          <IconButton
            size="sm"
            label={listed ? t('chat.pinnedHide') : t('chat.pinnedShow', { count: pinned.length })}
            aria-expanded={listed}
            icon={<CaretDownIcon className={listed ? styles.flipped : undefined} />}
            onClick={() => {
              setListed((value) => !value);
            }}
          />
        )}
      </div>
      {listed && (
        <ul className={styles.pinnedList}>
          {pinned.map((message) => (
            <li key={message.id} className={styles.pinnedEntry}>
              <button
                type="button"
                className={styles.pinnedItem}
                onClick={() => {
                  onJump(message.id);
                  setListed(false);
                }}
              >
                <span className={styles.quoteAuthor}>{message.author.name}</span>
                <span className={styles.pinnedPreview} dir="auto">
                  {preview(message)}
                </span>
              </button>
              {canUnpin && (
                <IconButton
                  size="sm"
                  label={t('chat.unpin')}
                  icon={<PushPinSlashIcon />}
                  onClick={() => {
                    onUnpin(message);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
