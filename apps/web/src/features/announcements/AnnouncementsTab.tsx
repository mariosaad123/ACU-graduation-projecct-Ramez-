import {
  ANNOUNCEMENT_BODY_MAX_LENGTH,
  ANNOUNCEMENT_MAX_ATTACHMENTS,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_VIDEO_MAX_BYTES,
  type Announcement,
  type GroupView,
} from '@acu/shared';
import {
  CheckIcon,
  ChecksIcon,
  MegaphoneIcon,
  PaperclipIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { IconButton } from '../../components/ui/IconButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { TextArea } from '../../components/ui/TextArea';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/toast/toast-context';
import { useFormatDate } from '../../i18n/use-format-date';
import { describeApiError } from '../auth/api-errors';
import { Avatar } from '../auth/Avatar';
import { AttachmentView } from '../chat/AttachmentView';
import { linkify } from '../chat/linkify';
import {
  useAnnouncementReceipts,
  useAnnouncements,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  useEditAnnouncement,
  useMarkAnnouncementsRead,
} from './api';
import styles from './Announcements.module.css';

const ACCEPTED =
  'image/*,video/mp4,video/webm,video/quicktime,audio/*,application/pdf,.docx,.pptx,.xlsx';

function AnnouncementDialog({
  groupId,
  editing,
  onClose,
}: {
  groupId: string;
  editing: Announcement | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateAnnouncement(groupId);
  const edit = useEditAnnouncement(groupId);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  const [important, setImportant] = useState(editing?.important ?? false);
  const [files, setFiles] = useState<File[]>([]);
  const [problems, setProblems] = useState<{ title?: boolean; body?: boolean; files?: string }>({});
  const input = useRef<HTMLInputElement>(null);
  const pending = create.isPending || edit.isPending;
  const failure = create.error ?? edit.error;

  const addFiles = (chosen: File[]) => {
    const tooLarge = chosen.find(
      (file) =>
        file.size >
        (file.type.startsWith('video/') ? CHAT_VIDEO_MAX_BYTES : CHAT_ATTACHMENT_MAX_BYTES),
    );
    if (tooLarge) {
      setProblems((current) => ({ ...current, files: t('announcements.fileTooLarge') }));
      return;
    }
    if (files.length + chosen.length > ANNOUNCEMENT_MAX_ATTACHMENTS) {
      setProblems((current) => ({ ...current, files: t('announcements.tooManyFiles') }));
      return;
    }
    setProblems((current) => ({ ...current, files: undefined }));
    setFiles((current) => [...current, ...chosen]);
  };

  const submit = () => {
    const missing = { title: !title.trim(), body: !body.trim() };
    if (missing.title || missing.body) {
      setProblems((current) => ({ ...current, ...missing }));
      return;
    }
    const done = {
      onSuccess: () => {
        toast({
          tone: 'success',
          title: editing ? t('announcements.saved') : t('announcements.posted'),
        });
        onClose();
      },
    };
    if (editing) {
      edit.mutate({ id: editing.id, title: title.trim(), body: body.trim(), important }, done);
    } else {
      create.mutate({ title: title.trim(), body: body.trim(), important, files }, done);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? t('announcements.editTitle') : t('announcements.newTitle')}
      description={editing ? undefined : t('announcements.newHint')}
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button loading={pending} onClick={submit}>
            {editing ? t('announcements.save') : t('announcements.post')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <TextField
          label={t('announcements.titleLabel')}
          error={problems.title ? t('announcements.titleError') : undefined}
          maxLength={ANNOUNCEMENT_TITLE_MAX_LENGTH}
          dir="auto"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setProblems((current) => ({ ...current, title: false }));
          }}
        />
        <TextArea
          label={t('announcements.bodyLabel')}
          error={problems.body ? t('announcements.bodyError') : undefined}
          rows={6}
          maxLength={ANNOUNCEMENT_BODY_MAX_LENGTH}
          dir="auto"
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setProblems((current) => ({ ...current, body: false }));
          }}
        />
        <Checkbox
          label={t('announcements.important')}
          hint={t('announcements.importantHint')}
          checked={important}
          onChange={(event) => {
            setImportant(event.target.checked);
          }}
        />
        {!editing && (
          <div className={styles.files}>
            <Button
              variant="secondary"
              size="sm"
              iconStart={<PaperclipIcon aria-hidden="true" />}
              disabled={files.length >= ANNOUNCEMENT_MAX_ATTACHMENTS}
              onClick={() => input.current?.click()}
            >
              {t('announcements.attach')}
            </Button>
            <span className={styles.muted}>
              {t('announcements.attachHint', { count: ANNOUNCEMENT_MAX_ATTACHMENTS })}
            </span>
            {files.length > 0 && (
              <ul className={styles.fileList}>
                {files.map((file, index) => (
                  <li key={`${file.name}-${String(file.size)}-${String(index)}`}>
                    <span dir="auto">{file.name}</span>
                    <IconButton
                      size="sm"
                      label={t('announcements.removeFile', { name: file.name })}
                      icon={<XIcon />}
                      onClick={() => {
                        setFiles((current) => current.filter((_, position) => position !== index));
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
            {problems.files && (
              <p className={styles.error} role="alert">
                {problems.files}
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
                  addFiles(chosen);
                }
              }}
            />
          </div>
        )}
        {failure && (
          <Alert tone="danger" live>
            {describeApiError(t, failure)}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

function ReceiptsDialog({
  groupId,
  announcement,
  onClose,
}: {
  groupId: string;
  announcement: Announcement;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const receipts = useAnnouncementReceipts(groupId, announcement.id);

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('announcements.receiptsTitle')}
      description={announcement.title}
    >
      {receipts.isPending && <Skeleton shape="block" blockSize="8rem" />}
      {receipts.isError && (
        <Alert tone="danger" live>
          {describeApiError(t, receipts.error)}
        </Alert>
      )}
      {receipts.isSuccess && (
        <div className={styles.receipts}>
          <section aria-labelledby="receipts-unread">
            <h3 id="receipts-unread" className={styles.receiptsTitle}>
              <WarningCircleIcon aria-hidden="true" />
              {t('announcements.notRead', { count: receipts.data.unread.length })}
            </h3>
            {receipts.data.unread.length === 0 ? (
              <p className={styles.muted}>{t('announcements.everyoneRead')}</p>
            ) : (
              <ul className={styles.readers}>
                {receipts.data.unread.map((person) => (
                  <li key={person.id}>
                    <Link to={`/app/people/${person.id}`} className={styles.reader}>
                      <Avatar user={person} size="2rem" />
                      {person.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="receipts-read">
            <h3 id="receipts-read" className={styles.receiptsTitle}>
              <ChecksIcon aria-hidden="true" />
              {t('announcements.readBy', { count: receipts.data.read.length })}
            </h3>
            <ul className={styles.readers}>
              {receipts.data.read.map((person) => (
                <li key={person.id}>
                  <Link to={`/app/people/${person.id}`} className={styles.reader}>
                    <Avatar user={person} size="2rem" />
                    <span>{person.name}</span>
                    <span className={styles.muted}>{formatDate(person.readAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Dialog>
  );
}

/** A group's official notices, apart from the chat, with who has read each for those who post. */
export function AnnouncementsTab({ view }: { view: GroupView }) {
  const { t } = useTranslation();
  const toast = useToast();
  const formatDate = useFormatDate();
  const announcements = useAnnouncements(view.id);
  const markRead = useMarkAnnouncementsRead(view.id);
  const remove = useDeleteAnnouncement(view.id);
  const [search] = useSearchParams();
  const wanted = search.get('announcement');
  const [writing, setWriting] = useState<{ editing: Announcement | null } | null>(null);
  const [receiptsOf, setReceiptsOf] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  // What was unread when the tab opened keeps its "new" mark while the reader is here.
  const [freshIds, setFreshIds] = useState<ReadonlySet<string> | null>(null);
  const sent = useRef(new Set<string>());

  const list = announcements.data;
  if (list && freshIds === null) {
    setFreshIds(new Set(list.filter((entry) => !entry.read).map((entry) => entry.id)));
  }

  const { mutate: sendRead } = markRead;
  useEffect(() => {
    const unread = (list ?? []).filter((entry) => !entry.read && !sent.current.has(entry.id));
    if (unread.length === 0 || document.visibilityState !== 'visible') {
      return;
    }
    for (const entry of unread) {
      sent.current.add(entry.id);
    }
    sendRead(unread.map((entry) => entry.id));
  }, [list, sendRead]);

  useEffect(() => {
    if (wanted && list) {
      document.getElementById(`announcement-${wanted}`)?.scrollIntoView({ block: 'center' });
    }
  }, [wanted, list]);

  const canWrite = view.can.announce && !view.archived;

  return (
    <section className={styles.tab} aria-labelledby={`announcements-${view.id}`}>
      <header className={styles.head}>
        <div>
          <h2 id={`announcements-${view.id}`} className={styles.title}>
            {t('announcements.title')}
          </h2>
          <p className={styles.muted}>{t('announcements.lead')}</p>
        </div>
        {canWrite && (
          <Button
            iconStart={<PlusIcon aria-hidden="true" />}
            onClick={() => {
              setWriting({ editing: null });
            }}
          >
            {t('announcements.new')}
          </Button>
        )}
      </header>

      {announcements.isPending && <Skeleton shape="block" blockSize="10rem" />}
      {announcements.isError && (
        <Alert tone="danger" live>
          {describeApiError(t, announcements.error)}
        </Alert>
      )}
      {list?.length === 0 && (
        <div className={styles.empty}>
          <MegaphoneIcon aria-hidden="true" />
          <p>{canWrite ? t('announcements.emptyStaff') : t('announcements.empty')}</p>
        </div>
      )}

      <ol className={styles.list}>
        {list?.map((announcement) => (
          <li
            key={announcement.id}
            id={`announcement-${announcement.id}`}
            className={styles.card}
            data-important={announcement.important}
            data-wanted={announcement.id === wanted}
          >
            <div className={styles.cardHead}>
              <h3 className={styles.cardTitle} dir="auto">
                {announcement.title}
              </h3>
              {announcement.important && (
                <Badge tone="emblem" icon={<WarningCircleIcon aria-hidden="true" />}>
                  {t('announcements.importantBadge')}
                </Badge>
              )}
              {freshIds?.has(announcement.id) && (
                <Badge tone="info">{t('announcements.fresh')}</Badge>
              )}
              {announcement.canEdit && !view.archived && (
                <span className={styles.cardActions}>
                  <IconButton
                    size="sm"
                    label={t('announcements.edit')}
                    icon={<PencilSimpleIcon />}
                    onClick={() => {
                      setWriting({ editing: announcement });
                    }}
                  />
                  <IconButton
                    size="sm"
                    label={t('announcements.delete')}
                    icon={<TrashIcon />}
                    onClick={() => {
                      setDeleting(announcement);
                    }}
                  />
                </span>
              )}
            </div>
            <p className={styles.byline}>
              <Avatar user={announcement.author} size="1.5rem" />
              <Link to={`/app/people/${announcement.author.id}`} className={styles.author}>
                {announcement.author.name}
              </Link>
              {announcement.author.role !== 'student' && (
                <span className={styles.role}>{t(`roles.${announcement.author.role}`)}</span>
              )}
              <span>·</span>
              <time dateTime={announcement.createdAt}>{formatDate(announcement.createdAt)}</time>
              {announcement.edited && <span>· {t('chat.edited')}</span>}
            </p>
            <p className={styles.body} dir="auto">
              {linkify(announcement.body)}
            </p>
            {announcement.attachments.length > 0 && (
              <ul className={styles.attachments}>
                {announcement.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <AttachmentView attachment={attachment} authorName={announcement.author.name} />
                  </li>
                ))}
              </ul>
            )}
            {announcement.receipts && (
              <button
                type="button"
                className={styles.receiptsButton}
                onClick={() => {
                  setReceiptsOf(announcement);
                }}
              >
                <span className={styles.meter} aria-hidden="true">
                  <span
                    style={{
                      inlineSize: `${String(
                        announcement.receipts.total === 0
                          ? 0
                          : Math.round(
                              (announcement.receipts.read / announcement.receipts.total) * 100,
                            ),
                      )}%`,
                    }}
                  />
                </span>
                <CheckIcon aria-hidden="true" />
                {t('announcements.receipts', {
                  read: announcement.receipts.read,
                  total: announcement.receipts.total,
                })}
              </button>
            )}
          </li>
        ))}
      </ol>

      {writing && (
        <AnnouncementDialog
          key={writing.editing?.id ?? 'new'}
          groupId={view.id}
          editing={writing.editing}
          onClose={() => {
            setWriting(null);
          }}
        />
      )}
      {receiptsOf && (
        <ReceiptsDialog
          groupId={view.id}
          announcement={receiptsOf}
          onClose={() => {
            setReceiptsOf(null);
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        danger
        title={t('announcements.deleteTitle')}
        description={t('announcements.deleteBody')}
        confirmLabel={t('announcements.delete')}
        pending={remove.isPending}
        error={remove.isError ? describeApiError(t, remove.error) : null}
        onClose={() => {
          setDeleting(null);
          remove.reset();
        }}
        onConfirm={() => {
          if (deleting) {
            remove.mutate(deleting.id, {
              onSuccess: () => {
                toast({ tone: 'success', title: t('announcements.deleted') });
                setDeleting(null);
              },
            });
          }
        }}
      />
    </section>
  );
}
