import { PHOTO_MAX_BYTES } from '@acu/shared';
import { CameraIcon, TrashIcon } from '@phosphor-icons/react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import styles from './PhotoField.module.css';

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif';

interface PhotoFieldProps {
  /** The picture as it is now, rendered by the caller (a profile avatar or a group photo). */
  preview: ReactNode;
  hasPhoto: boolean;
  removeLabel: string;
  onUpload: (file: File) => void;
  onRemove: () => void;
  busy: boolean;
  /** A message from the server, shown under the field. */
  error?: string | null;
  label: string;
}

/**
 * Picks a photo and hands it over at once. The size and type are checked here for a quick answer;
 * the server checks the content again and re-encodes the image.
 */
export function PhotoField({
  preview,
  hasPhoto,
  removeLabel,
  onUpload,
  onRemove,
  busy,
  error,
  label,
}: PhotoFieldProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [problem, setProblem] = useState<string | null>(null);
  const message = problem ?? error ?? null;

  return (
    <div className={styles.field} role="group" aria-label={label} aria-describedby={hintId}>
      <div className={styles.preview}>{preview}</div>
      <div className={styles.controls}>
        <div className={styles.buttons}>
          <Button
            variant="secondary"
            size="sm"
            iconStart={<CameraIcon aria-hidden="true" />}
            loading={busy}
            onClick={() => input.current?.click()}
          >
            {hasPhoto ? t('photo.change') : t('photo.upload')}
          </Button>
          {hasPhoto && (
            <Button
              variant="ghost"
              size="sm"
              iconStart={<TrashIcon aria-hidden="true" />}
              disabled={busy}
              onClick={onRemove}
            >
              {removeLabel}
            </Button>
          )}
        </div>
        <p id={hintId} className={styles.hint}>
          {t('photo.hint')}
        </p>
        {message && (
          <p className={styles.error} role="alert">
            {message}
          </p>
        )}
        <input
          ref={input}
          type="file"
          accept={ACCEPTED}
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clear the input so the same file can be chosen again after an error.
            event.target.value = '';
            if (!file) {
              return;
            }
            if (!file.type.startsWith('image/')) {
              setProblem(t('photo.notImage'));
              return;
            }
            if (file.size > PHOTO_MAX_BYTES) {
              setProblem(t('photo.tooLarge'));
              return;
            }
            setProblem(null);
            onUpload(file);
          }}
        />
      </div>
    </div>
  );
}
