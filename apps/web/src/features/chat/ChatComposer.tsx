import { CHAT_ATTACHMENT_MAX_BYTES, CHAT_MESSAGE_MAX_LENGTH, type ChatMessage } from '@acu/shared';
import { MicrophoneIcon, PaperclipIcon, PaperPlaneRightIcon, XIcon } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { VoiceRecorder } from '../../components/media/VoiceRecorder';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import styles from './Chat.module.css';

const ACCEPTED = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  '.docx',
  '.pptx',
  '.xlsx',
  'audio/*',
].join(',');

/** Longest voice message that can be recorded in the chat. */
const VOICE_MAX_SECONDS = 180;

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

/**
 * Writes a message: text, one attachment or a voice recording, as a reply or not. Enter sends,
 * Shift+Enter starts a new line. Editing reuses the same box for the message's text.
 */
export function ChatComposer({
  replyTo,
  editing,
  sending,
  error,
  onSend,
  onSaveEdit,
  onCancelReply,
  onCancelEdit,
}: ChatComposerProps) {
  const { t } = useTranslation();
  // The parent gives the composer a new key when editing starts or ends, so this starts fresh.
  const [body, setBody] = useState(editing?.body ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const counterId = useId();

  // Editing or replying puts the cursor in the box.
  useEffect(() => {
    if (editing || replyTo) {
      textarea.current?.focus();
    }
  }, [editing, replyTo]);

  const trimmed = body.trim();
  const tooLong = body.length > CHAT_MESSAGE_MAX_LENGTH;
  const canSend =
    !sending && !tooLong && (editing ? trimmed.length > 0 : trimmed.length > 0 || file !== null);

  const submit = async () => {
    if (!canSend) {
      return;
    }
    const done = editing
      ? await onSaveEdit(editing, trimmed)
      : await onSend({ body: trimmed, file, replyToId: replyTo?.id ?? null });
    if (done) {
      setBody('');
      setFile(null);
      setRecording(false);
      setProblem(null);
      textarea.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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
    if (chosen.size > CHAT_ATTACHMENT_MAX_BYTES) {
      setProblem(t('chat.fileTooLarge'));
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
                {replyTo.body.slice(0, 120)}
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
          <>
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
          </>
        )}
        <textarea
          ref={textarea}
          className={styles.textarea}
          rows={1}
          dir="auto"
          value={body}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.messageLabel')}
          aria-describedby={
            tooLong || body.length > CHAT_MESSAGE_MAX_LENGTH * 0.9 ? counterId : undefined
          }
          aria-invalid={tooLong || undefined}
          onChange={(event) => {
            setBody(event.target.value);
          }}
          onKeyDown={onKeyDown}
        />
        <Button
          iconStart={<PaperPlaneRightIcon className="mirror-in-rtl" aria-hidden="true" />}
          loading={sending}
          disabled={!canSend}
          onClick={() => {
            void submit();
          }}
        >
          {recording && file ? t('chat.sendRecording') : t('chat.send')}
        </Button>
      </div>

      {body.length > CHAT_MESSAGE_MAX_LENGTH * 0.9 && (
        <p id={counterId} className={styles.counter} data-over={tooLong}>
          {body.length} / {CHAT_MESSAGE_MAX_LENGTH}
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
