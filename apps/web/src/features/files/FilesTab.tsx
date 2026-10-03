import {
  ATTACHMENT_KINDS,
  groupFilesResponseSchema,
  type AttachmentKind,
  type GroupFile,
  type GroupView,
} from '@acu/shared';
import {
  ArrowSquareOutIcon,
  DownloadSimpleIcon,
  FileIcon,
  FilePdfIcon,
  FilesIcon,
  ImageIcon,
  MicrophoneIcon,
  VideoCameraIcon,
} from '@phosphor-icons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useDeferredValue, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AudioPlayer } from '../../components/media/AudioPlayer';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { TextField } from '../../components/ui/TextField';
import { useFormatDate } from '../../i18n/use-format-date';
import { apiRequest } from '../../lib/api';
import { describeApiError } from '../auth/api-errors';
import { useFormatSize } from '../chat/use-format-size';
import styles from './Files.module.css';

const KIND_ICONS: Record<AttachmentKind, ReactNode> = {
  image: <ImageIcon aria-hidden="true" />,
  video: <VideoCameraIcon aria-hidden="true" />,
  audio: <MicrophoneIcon aria-hidden="true" />,
  document: <FilesIcon aria-hidden="true" />,
};

function useGroupFiles(groupId: string, kind: AttachmentKind, search: string) {
  return useInfiniteQuery({
    queryKey: ['group', groupId, 'files', kind, search],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ kind });
      if (search) {
        params.set('q', search);
      }
      if (pageParam) {
        params.set('before', pageParam);
      }
      return apiRequest(`/api/groups/${groupId}/files?${params.toString()}`, {
        schema: groupFilesResponseSchema,
      });
    },
    getNextPageParam: (last) => (last.hasMore ? (last.files.at(-1)?.createdAt ?? null) : null),
  });
}

/** Where a file came from: its message in the chat, or its announcement. */
function sourceLink(file: GroupFile): string {
  return file.source === 'chat'
    ? `?tab=chat&message=${file.sourceId}`
    : `?tab=announcements&announcement=${file.sourceId}`;
}

function FileMeta({ file }: { file: GroupFile }) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  return (
    <span className={styles.meta}>
      <Link to={`/app/people/${file.author.id}`}>{file.author.name}</Link>
      {' · '}
      <time dateTime={file.createdAt}>{formatDate(file.createdAt)}</time>
      {' · '}
      <Link to={sourceLink(file)} className={styles.source}>
        {file.source === 'chat' ? t('files.inChat') : t('files.inAnnouncement')}
        <ArrowSquareOutIcon className="mirror-in-rtl" aria-hidden="true" />
      </Link>
    </span>
  );
}

function FileEntry({ file }: { file: GroupFile }) {
  const { t } = useTranslation();
  const formatSize = useFormatSize();
  const { attachment } = file;

  if (attachment.kind === 'image') {
    return (
      <li className={styles.tile}>
        <a href={attachment.url} target="_blank" rel="noopener" className={styles.thumb}>
          <img
            src={attachment.url}
            alt={t('chat.photoAlt', { name: file.author.name })}
            loading="lazy"
          />
        </a>
        <FileMeta file={file} />
      </li>
    );
  }
  if (attachment.kind === 'video') {
    return (
      <li className={styles.tile}>
        <video
          className={styles.video}
          src={attachment.url}
          controls
          preload="metadata"
          playsInline
          aria-label={t('chat.videoLabel', { name: attachment.name ?? file.author.name })}
        />
        {attachment.name && (
          <span className={styles.name} dir="auto">
            {attachment.name}
          </span>
        )}
        <FileMeta file={file} />
      </li>
    );
  }
  if (attachment.kind === 'audio') {
    return (
      <li className={styles.row}>
        <AudioPlayer src={attachment.url} title={attachment.name ?? t('chat.voice')} />
        <FileMeta file={file} />
      </li>
    );
  }
  const name = attachment.name ?? t('chat.document');
  const Icon = attachment.contentType === 'application/pdf' ? FilePdfIcon : FileIcon;
  return (
    <li className={styles.row}>
      <span className={styles.document}>
        <Icon className={styles.documentIcon} aria-hidden="true" />
        <span className={styles.documentText}>
          <span className={styles.name} dir="auto">
            {name}
          </span>
          <span className={styles.meta}>{formatSize(attachment.size)}</span>
        </span>
        <a
          href={attachment.url}
          download={name}
          className={styles.download}
          aria-label={t('chat.download', { name })}
        >
          <DownloadSimpleIcon aria-hidden="true" />
          {t('files.download')}
        </a>
      </span>
      <FileMeta file={file} />
    </li>
  );
}

/** Everything shared in a group, from its chat and its announcements, sorted into four kinds. */
export function FilesTab({ view }: { view: GroupView }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<AttachmentKind>('image');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const files = useGroupFiles(view.id, kind, kind === 'image' ? '' : deferredSearch);
  const pages = files.data?.pages ?? [];
  const counts = pages[0]?.counts;
  const list = pages.flatMap((page) => page.files);
  const grid = kind === 'image' || kind === 'video';

  return (
    <section className={styles.tab} aria-labelledby={`files-${view.id}`}>
      <header className={styles.head}>
        <div>
          <h2 id={`files-${view.id}`} className={styles.title}>
            {t('files.title')}
          </h2>
          <p className={styles.muted}>{t('files.lead')}</p>
        </div>
      </header>

      <div className={styles.kinds} role="group" aria-label={t('files.kindsLabel')}>
        {ATTACHMENT_KINDS.map((entry) => (
          <button
            key={entry}
            type="button"
            className={styles.kind}
            aria-pressed={kind === entry}
            onClick={() => {
              setKind(entry);
            }}
          >
            {KIND_ICONS[entry]}
            <span>{t(`files.kinds.${entry}`)}</span>
            <span className={styles.count}>{counts ? counts[entry] : '–'}</span>
          </button>
        ))}
      </div>

      {kind !== 'image' && (
        <TextField
          label={t('files.search')}
          type="search"
          optional
          dir="auto"
          value={search}
          className={styles.search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      )}

      {files.isPending && <Skeleton shape="block" blockSize="10rem" />}
      {files.isError && (
        <Alert tone="danger" live>
          {describeApiError(t, files.error)}
        </Alert>
      )}
      {files.isSuccess && list.length === 0 && (
        <p className={styles.empty}>
          {deferredSearch && kind !== 'image' ? t('files.noMatch') : t(`files.empty.${kind}`)}
        </p>
      )}

      <ul className={grid ? styles.grid : styles.rows}>
        {list.map((file) => (
          <FileEntry key={file.attachment.id} file={file} />
        ))}
      </ul>

      {files.hasNextPage && (
        <Button
          variant="secondary"
          className={styles.more}
          loading={files.isFetchingNextPage}
          onClick={() => {
            void files.fetchNextPage();
          }}
        >
          {t('files.more')}
        </Button>
      )}
    </section>
  );
}
