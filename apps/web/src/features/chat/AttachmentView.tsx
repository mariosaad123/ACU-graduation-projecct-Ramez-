import type { Attachment } from '@acu/shared';
import { DownloadSimpleIcon, FileIcon, FilePdfIcon } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { AudioPlayer } from '../../components/media/AudioPlayer';
import { useFormatSize } from './use-format-size';
import styles from './Chat.module.css';

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

/** An attachment as it shows in a message or an announcement: seen, played or downloaded. */
export function AttachmentView({
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
  if (attachment.kind === 'video') {
    return (
      <video
        className={styles.video}
        src={attachment.url}
        controls
        preload="metadata"
        playsInline
        aria-label={t('chat.videoLabel', { name: attachment.name ?? authorName })}
      />
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
