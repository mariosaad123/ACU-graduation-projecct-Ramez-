import { CHAT_ATTACHMENT_MAX_BYTES, CHAT_VIDEO_MAX_BYTES, type Attachment } from '@acu/shared';
import { PaperclipIcon, XIcon } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { useFormatSize } from '../chat/use-format-size';
import styles from './Coursework.module.css';

const ACCEPTED =
  'image/*,video/mp4,video/webm,video/quicktime,audio/*,application/pdf,.docx,.pptx,.xlsx';

interface FilePickerProps {
  /** Files chosen now, not sent yet. */
  files: readonly File[];
  onChange: (files: File[]) => void;
  /** Files already saved, which can be kept or dropped. */
  kept?: readonly Attachment[];
  onDropKept?: (id: string) => void;
  max: number;
  disabled?: boolean;
}

/**
 * Chooses files for an assignment or a submission. A file that is too large, or one too many, is
 * refused here with the reason, before anything is uploaded.
 */
export function FilePicker({
  files,
  onChange,
  kept = [],
  onDropKept,
  max,
  disabled = false,
}: FilePickerProps) {
  const { t } = useTranslation();
  const formatSize = useFormatSize();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const total = kept.length + files.length;

  const add = (chosen: File[]) => {
    const tooLarge = chosen.find(
      (file) =>
        file.size >
        (file.type.startsWith('video/') ? CHAT_VIDEO_MAX_BYTES : CHAT_ATTACHMENT_MAX_BYTES),
    );
    if (tooLarge) {
      setProblem(t('filePicker.tooLarge', { name: tooLarge.name }));
      return;
    }
    if (total + chosen.length > max) {
      setProblem(t('filePicker.tooMany', { count: max }));
      return;
    }
    setProblem(null);
    onChange([...files, ...chosen]);
  };

  return (
    <div className={styles.picker}>
      <div className={styles.pickerHead}>
        <Button
          variant="secondary"
          size="sm"
          iconStart={<PaperclipIcon aria-hidden="true" />}
          disabled={disabled || total >= max}
          onClick={() => input.current?.click()}
        >
          {t('filePicker.attach')}
        </Button>
        <span className={styles.muted}>{t('filePicker.hint', { count: max })}</span>
      </div>
      {total > 0 && (
        <ul className={styles.pickerList}>
          {kept.map((file) => (
            <li key={file.id}>
              <span dir="auto">{file.name ?? t(`files.kinds.${file.kind}`)}</span>
              <span className={styles.muted}>{formatSize(file.size)}</span>
              {onDropKept && (
                <IconButton
                  size="sm"
                  label={t('filePicker.remove', {
                    name: file.name ?? t(`files.kinds.${file.kind}`),
                  })}
                  icon={<XIcon />}
                  disabled={disabled}
                  onClick={() => {
                    onDropKept(file.id);
                  }}
                />
              )}
            </li>
          ))}
          {files.map((file, index) => (
            <li key={`${file.name}-${String(file.size)}-${String(index)}`}>
              <span dir="auto">{file.name}</span>
              <span className={styles.muted}>{formatSize(file.size)}</span>
              <IconButton
                size="sm"
                label={t('filePicker.remove', { name: file.name })}
                icon={<XIcon />}
                disabled={disabled}
                onClick={() => {
                  onChange(files.filter((_, position) => position !== index));
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const chosen = [...(event.target.files ?? [])];
          event.target.value = '';
          if (chosen.length > 0) {
            add(chosen);
          }
        }}
      />
    </div>
  );
}
