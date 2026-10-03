import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_VIDEO_MAX_BYTES,
  type ChatMessage,
  type GroupPerson,
} from '@acu/shared';
import {
  ChartBarIcon,
  MicrophoneIcon,
  PaperclipIcon,
  PaperPlaneRightIcon,
  UsersThreeIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { VoiceRecorder } from '../../components/media/VoiceRecorder';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Avatar } from '../auth/Avatar';
import { mentionQuery, plainBody, toTokens } from './mentions';
import styles from './Chat.module.css';

const ACCEPTED = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
  '.docx',
  '.pptx',
  '.xlsx',
  'audio/*',
].join(',');

/** Longest voice message that can be recorded in the chat. */
const VOICE_MAX_SECONDS = 180;
/** How many people the @ list shows at once. */
const SUGGESTIONS = 6;

export interface ComposerDraft {
  body: string;
  file: File | null;
  replyToId: string | null;
}

interface ChatComposerProps {
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  sending: boolean;
  error: string | null;
  /** The group's people, for the @ list. */
  people: readonly GroupPerson[];
  canMentionAll: boolean;
  /** Present when the person may ask the group a question. */
  onCreatePoll?: () => void;
  onSend: (draft: ComposerDraft) => Promise<boolean>;
  onSaveEdit: (message: ChatMessage, body: string) => Promise<boolean>;
  onCancelReply: () => void;
  onCancelEdit: () => void;
}

function extensionFor(type: string): string {
  if (type.includes('mp4')) {
    return 'm4a';
  }
  if (type.includes('ogg')) {
    return 'ogg';
  }
  return 'webm';
}

type Suggestion = { kind: 'person'; person: GroupPerson } | { kind: 'all' };

/**
 * Writes a message: text, one attachment or a voice recording, as a reply or not. Enter sends,
 * Shift+Enter starts a new line. Typing @ lists the group's people; the name chosen becomes a
 * mention when the message is sent. Editing reuses the same box for the message's text.
 */
export function ChatComposer({
  replyTo,
  editing,
  sending,
  error,
  people,
  canMentionAll,
  onCreatePoll,
  onSend,
  onSaveEdit,
  onCancelReply,
  onCancelEdit,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const everyone = t('chat.everyone');
  // The parent gives the composer a new key when editing starts or ends, so this starts fresh.
  const [body, setBody] = useState(
    editing?.body ? plainBody(editing.body, editing.mentions, everyone) : '',
  );
  // Names picked from the @ list, with whom they stand for.
  const [picked, setPicked] = useState(
    () => new Map(editing?.mentions.map((person) => [person.name, person.id])),
  );
  const [cursor, setCursor] = useState(0);
  const [highlighted, setHighlighted] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const counterId = useId();
  const listId = useId();

  // Editing or replying puts the cursor in the box.
  useEffect(() => {
    if (editing || replyTo) {
      textarea.current?.focus();
    }
  }, [editing, replyTo]);

  const query = mentionQuery(body, cursor);
  const wanted = query?.query.toLocaleLowerCase() ?? '';
  const suggestions: Suggestion[] =
    query && query.start !== dismissed
      ? [
          ...(canMentionAll && everyone.toLocaleLowerCase().startsWith(wanted)
            ? [{ kind: 'all' } as const]
            : []),
          ...people
            .filter((person) => !person.me && person.name.toLocaleLowerCase().includes(wanted))
            .slice(0, SUGGESTIONS)
            .map((person) => ({ kind: 'person', person }) as const),
        ]
      : [];
  const active = Math.min(highlighted, Math.max(suggestions.length - 1, 0));

  const pick = (suggestion: Suggestion) => {
    if (!query) {
      return;
    }
    const name = suggestion.kind === 'all' ? everyone : suggestion.person.name;
    const next = `${body.slice(0, query.start)}@${name} ${body.slice(cursor)}`;
    const caret = query.start + name.length + 2;
    setBody(next);
    setCursor(caret);
    setHighlighted(0);
    if (suggestion.kind === 'person') {
      setPicked((current) => new Map(current).set(name, suggestion.person.id));
    }
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(caret, caret);
    });
  };

  const trimmed = body.trim();
  const tooLong = body.length > CHAT_MESSAGE_MAX_LENGTH;
  const canSend =
    !sending && !tooLong && (editing ? trimmed.length > 0 : trimmed.length > 0 || file !== null);

  const submit = async () => {
    if (!canSend) {
      return;
    }
    const text = toTokens(trimmed, picked, canMentionAll ? [everyone] : []);
    const done = editing
      ? await onSaveEdit(editing, text)
      : await onSend({ body: text, file, replyToId: replyTo?.id ?? null });
    if (done) {
      setBody('');
      setPicked(new Map());
      setFile(null);
      setRecording(false);
      setProblem(null);
      textarea.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      const chosen = suggestions[active];
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setHighlighted((active + step + suggestions.length) % suggestions.length);
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && chosen) {
        event.preventDefault();
        pick(chosen);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissed(query?.start ?? null);
        return;
      }
    }
    // Enter while an input method is composing a character belongs to it, not to sending.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
    if (event.key === 'Escape' && (editing || replyTo)) {
      event.preventDefault();
      if (editing) {
        setBody('');
        onCancelEdit();
      } else {
        onCancelReply();
      }
    }
  };

  const attach = (chosen: File) => {
    const video = chosen.type.startsWith('video/');
    if (chosen.size > (video ? CHAT_VIDEO_MAX_BYTES : CHAT_ATTACHMENT_MAX_BYTES)) {
      setProblem(video ? t('chat.videoTooLarge') : t('chat.fileTooLarge'));
      return;
    }
    setProblem(null);
    setFile(chosen);
  };

  const message = problem ?? error;

  return (
    <div className={styles.composer}>
      {(replyTo ?? editing) && (
        <div className={styles.context}>
          <span className={styles.contextText}>
            {editing
              ? t('chat.editing')
              : t('chat.replyingTo', { name: replyTo?.author.name ?? '' })}
            {!editing && replyTo?.body && (
              <span className={styles.contextQuote} dir="auto">
                {plainBody(replyTo.body, replyTo.mentions, everyone).slice(0, 120)}
              </span>
            )}
          </span>
          <IconButton
            size="sm"
            label={t('chat.cancel')}
            icon={<XIcon />}
            onClick={() => {
              if (editing) {
                setBody('');
                onCancelEdit();
              } else {
                onCancelReply();
              }
            }}
          />
        </div>
      )}

      {recording && !editing && (
        <div className={styles.recorder}>
          <VoiceRecorder
            maxDurationSeconds={VOICE_MAX_SECONDS}
            onRecorded={(blob) => {
              const type = blob.type || 'audio/webm';
              attach(new File([blob], `voice.${extensionFor(type)}`, { type }));
            }}
            onReset={() => {
              setFile(null);
            }}
          />
        </div>
      )}

      {file && !recording && (
        <div className={styles.attached}>
          <PaperclipIcon aria-hidden="true" />
          <span className={styles.attachedName} dir="auto">
            {file.name}
          </span>
          <IconButton
            size="sm"
            label={t('chat.removeAttachment')}
            icon={<XIcon />}
            onClick={() => {
              setFile(null);
            }}
          />
        </div>
      )}

      <div className={styles.inputRow}>
        {!editing && (
          <div className={styles.tools}>
            <IconButton
              label={t('chat.attach')}
              icon={<PaperclipIcon />}
              disabled={sending}
              onClick={() => fileInput.current?.click()}
            />
            <IconButton
              label={t('chat.record')}
              icon={<MicrophoneIcon />}
              aria-pressed={recording}
              disabled={sending}
              onClick={() => {
                setRecording((value) => !value);
                setFile(null);
              }}
            />
            {onCreatePoll && (
              <IconButton
                label={t('poll.createTitle')}
                icon={<ChartBarIcon />}
                disabled={sending}
                onClick={onCreatePoll}
              />
            )}
          </div>
        )}
        <div className={styles.inputBox}>
          {suggestions.length > 0 && (
            <ul
              id={listId}
              className={styles.suggestions}
              role="listbox"
              aria-label={t('chat.mentionList')}
            >
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion.kind === 'all' ? 'all' : suggestion.person.id}
                  id={`${listId}-${String(index)}`}
                  role="option"
                  aria-selected={index === active}
                  className={styles.suggestion}
                  // Keeps the caret in the box while a name is chosen with the pointer.
                  onPointerDown={(event) => {
                    event.preventDefault();
                    pick(suggestion);
                  }}
                >
                  {suggestion.kind === 'all' ? (
                    <>
                      <span className={styles.suggestionIcon}>
                        <UsersThreeIcon aria-hidden="true" />
                      </span>
                      <span>
                        @{everyone}
                        <span className={styles.suggestionHint}>{t('chat.everyoneHint')}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <Avatar user={suggestion.person} size="1.75rem" />
                      <span>
                        {suggestion.person.name}
                        {suggestion.person.role !== 'student' && (
                          <span className={styles.suggestionHint}>
                            {t(`roles.${suggestion.person.role}`)}
                          </span>
                        )}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={textarea}
            className={styles.textarea}
            rows={1}
            dir={body ? 'auto' : undefined}
            value={body}
            placeholder={t('chat.placeholder')}
            aria-label={t('chat.messageLabel')}
            aria-describedby={
              tooLong || body.length > CHAT_MESSAGE_MAX_LENGTH * 0.9 ? counterId : undefined
            }
            aria-invalid={tooLong || undefined}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls={suggestions.length > 0 ? listId : undefined}
            aria-activedescendant={
              suggestions.length > 0 ? `${listId}-${String(active)}` : undefined
            }
            onChange={(event) => {
              setBody(event.target.value);
              setCursor(event.target.selectionStart);
              setDismissed(null);
            }}
            onSelect={(event) => {
              setCursor(event.currentTarget.selectionStart);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <Button
          iconStart={<PaperPlaneRightIcon className="mirror-in-rtl" aria-hidden="true" />}
          loading={sending}
          disabled={!canSend}
          className={styles.send}
          onClick={() => {
            void submit();
          }}
        >
          <span className={styles.sendLabel}>
            {editing
              ? t('chat.save')
              : recording && file
                ? t('chat.sendRecording')
                : t('chat.send')}
          </span>
        </Button>
      </div>

      {body.length > CHAT_MESSAGE_MAX_LENGTH * 0.9 && (
        <p id={counterId} className={styles.counter} data-over={tooLong}>
          <bdi dir="ltr">
            {body.length} / {CHAT_MESSAGE_MAX_LENGTH}
          </bdi>
        </p>
      )}
      {message && (
        <p className={styles.composerError} role="alert">
          {message}
        </p>
      )}
      <p className={styles.composerHint}>{t('chat.attachHint')}</p>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = '';
          if (chosen) {
            setRecording(false);
            attach(chosen);
          }
        }}
      />
    </div>
  );
}
