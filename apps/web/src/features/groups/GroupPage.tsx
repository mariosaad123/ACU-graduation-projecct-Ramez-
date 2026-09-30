import { addMemberSchema, formatJoinCode, groupUpdateSchema, type Group } from '@acu/shared';
import {
  ArchiveIcon,
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  PencilSimpleIcon,
  UserPlusIcon,
} from '@phosphor-icons/react';
import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { Container } from '../../components/layout/Container';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Checkbox } from '../../components/ui/Checkbox';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { PhotoField } from '../../components/ui/PhotoField';
import { Spinner } from '../../components/ui/Spinner';
import { Tabs } from '../../components/ui/Tabs';
import { TextArea } from '../../components/ui/TextArea';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/toast/toast-context';
import { useLanguageName } from '../../i18n/use-language-name';
import { ApiError } from '../../lib/api';
import { NotFoundPage } from '../../pages/NotFoundPage';
import { PageTitle } from '../../pages/PageTitle';
import { describeApiError } from '../auth/api-errors';
import { GroupChat } from '../chat/GroupChat';
import { useGroupView } from '../chat/use-chat';
import {
  useAddMember,
  useDoctorGroups,
  useGroupCommand,
  useGroupPhoto,
  useUpdateGroup,
} from './api';
import { CopyButton } from './CopyButton';
import { GroupPhoto } from './GroupPhoto';
import { MembersPanel } from './MembersPanel';
import { joinLink } from './pending-join';
import styles from './Groups.module.css';

function EditGroupDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const update = useUpdateGroup(group.id);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [problems, setProblems] = useState<{ name?: boolean; description?: boolean }>({});

  const submit = () => {
    const parsed = groupUpdateSchema.safeParse({ name, description });
    if (!parsed.success) {
      const fields = new Set(parsed.error.issues.map((issue) => String(issue.path[0])));
      setProblems({ name: fields.has('name'), description: fields.has('description') });
      return;
    }
    update.mutate(parsed.data, {
      onSuccess: () => {
        toast({ tone: 'success', title: t('groups.saved') });
        onClose();
      },
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('groups.editTitle')}
      dismissOnBackdrop={!update.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={update.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={update.isPending}>
            {t('groups.save')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <TextField
          label={t('groups.name')}
          hint={t('groups.nameHint')}
          error={problems.name ? t('groups.nameError') : undefined}
          value={name}
          maxLength={80}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <TextArea
          label={t('groups.description')}
          hint={t('groups.descriptionHint')}
          error={problems.description ? t('groups.descriptionError') : undefined}
          optional
          rows={3}
          maxLength={300}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
        {update.isError && (
          <Alert tone="danger" live>
            {describeApiError(t, update.error)}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

function SharePanel({ group }: { group: Group }) {
  const { t } = useTranslation();
  const toast = useToast();
  const regenerate = useGroupCommand(group.id, 'code');
  const [confirming, setConfirming] = useState(false);
  const code = formatJoinCode(group.joinCode);

  return (
    <Card className={styles.share}>
      <p className={styles.muted}>{t('groups.code')}</p>
      <p className={styles.bigCode} dir="ltr">
        {code}
      </p>
      <div className={styles.shareActions}>
        <CopyButton text={code} label={t('groups.copyCode')} size="md" />
        <CopyButton
          text={joinLink(group.joinCode)}
          label={t('groups.copyLink')}
          kind="link"
          size="md"
        />
        <Button
          variant="ghost"
          iconStart={<ArrowCounterClockwiseIcon aria-hidden="true" />}
          onClick={() => {
            setConfirming(true);
          }}
        >
          {t('groups.regenerate')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={t('groups.regenerateTitle')}
        description={t('groups.regenerateBody')}
        confirmLabel={t('groups.regenerateConfirm')}
        pending={regenerate.isPending}
        error={regenerate.isError ? describeApiError(t, regenerate.error) : null}
        onClose={() => {
          setConfirming(false);
          regenerate.reset();
        }}
        onConfirm={() => {
          regenerate.mutate(undefined, {
            onSuccess: () => {
              toast({ tone: 'success', title: t('groups.regenerated') });
              setConfirming(false);
            },
          });
        }}
      />
    </Card>
  );
}

function SettingsPanel({ group }: { group: Group }) {
  const { t } = useTranslation();
  const toast = useToast();
  const update = useUpdateGroup(group.id);
  const archive = useGroupCommand(group.id, 'archive');
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const photo = useGroupPhoto(group.id);
  const photoError = photo.upload.error ?? photo.remove.error;

  const toggle = (
    change: { joinOpen: boolean } | { requiresApproval: boolean } | { chatOpen: boolean },
  ) => {
    update.mutate(change, {
      onSuccess: () => {
        toast({ tone: 'success', title: t('groups.saved') });
      },
      onError: (error) => {
        toast({ tone: 'danger', title: describeApiError(t, error) });
      },
    });
  };

  return (
    <Card className={styles.settings}>
      <h2 className={styles.cardTitle}>{t('groups.settings')}</h2>
      <PhotoField
        label={t('groups.photo')}
        preview={
          <GroupPhoto photoUrl={group.photoUrl} language={group.language} size="lg" active />
        }
        hasPhoto={group.photoUrl !== null}
        removeLabel={t('photo.remove')}
        busy={photo.upload.isPending || photo.remove.isPending}
        error={photoError ? describeApiError(t, photoError) : null}
        onUpload={(file) => {
          photo.remove.reset();
          photo.upload.mutate(file, {
            onSuccess: () => {
              toast({ tone: 'success', title: t('groups.photoSaved') });
            },
          });
        }}
        onRemove={() => {
          photo.upload.reset();
          photo.remove.mutate(undefined, {
            onSuccess: () => {
              toast({ tone: 'success', title: t('groups.photoRemoved') });
            },
          });
        }}
      />
      <Checkbox
        label={t('groups.chatOpen')}
        hint={t('groups.chatOpenHint')}
        checked={group.chatOpen}
        disabled={update.isPending}
        onChange={(event) => {
          toggle({ chatOpen: event.target.checked });
        }}
      />
      <Checkbox
        label={t('groups.joinOpen')}
        hint={t('groups.joinOpenHint')}
        checked={group.joinOpen}
        disabled={update.isPending}
        onChange={(event) => {
          toggle({ joinOpen: event.target.checked });
        }}
      />
      <Checkbox
        label={t('groups.requiresApproval')}
        hint={t('groups.requiresApprovalHint')}
        checked={group.requiresApproval}
        disabled={update.isPending}
        onChange={(event) => {
          toggle({ requiresApproval: event.target.checked });
        }}
      />
      <div className={styles.settingsActions}>
        <Button
          variant="secondary"
          iconStart={<PencilSimpleIcon aria-hidden="true" />}
          onClick={() => {
            setEditing(true);
          }}
        >
          {t('groups.edit')}
        </Button>
        <Button
          variant="ghost"
          iconStart={<ArchiveIcon aria-hidden="true" />}
          onClick={() => {
            setArchiving(true);
          }}
        >
          {t('groups.archive')}
        </Button>
      </div>
      {editing && (
        <EditGroupDialog
          group={group}
          onClose={() => {
            setEditing(false);
          }}
        />
      )}
      <ConfirmDialog
        open={archiving}
        title={t('groups.archiveTitle', { name: group.name })}
        description={t('groups.archiveBody')}
        confirmLabel={t('groups.archiveConfirm')}
        pending={archive.isPending}
        error={archive.isError ? describeApiError(t, archive.error) : null}
        onClose={() => {
          setArchiving(false);
          archive.reset();
        }}
        onConfirm={() => {
          archive.mutate(undefined, {
            onSuccess: () => {
              toast({ tone: 'success', title: t('groups.archivedDone') });
              setArchiving(false);
            },
          });
        }}
      />
    </Card>
  );
}

function AddMemberForm({ group }: { group: Group }) {
  const { t } = useTranslation();
  const toast = useToast();
  const add = useAddMember(group.id);
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = addMemberSchema.safeParse({ email });
    if (!parsed.success) {
      setProblem(t('groups.addError'));
      return;
    }
    add.mutate(parsed.data.email, {
      onSuccess: (member) => {
        toast({ tone: 'success', title: t('groups.added', { name: member.student.name }) });
        setEmail('');
        setProblem(null);
      },
      onError: (error) => {
        setProblem(
          error instanceof ApiError && error.code === 'ALREADY_MEMBER'
            ? t('groups.alreadyInGroup')
            : describeApiError(t, error),
        );
      },
    });
  };

  return (
    <form className={styles.addForm} onSubmit={submit} noValidate>
      <TextField
        label={t('groups.addLabel')}
        hint={t('groups.addHint')}
        error={problem ?? undefined}
        type="email"
        dir="ltr"
        autoComplete="off"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          setProblem(null);
        }}
      />
      <Button type="submit" iconStart={<UserPlusIcon aria-hidden="true" />} loading={add.isPending}>
        {t('groups.addSubmit')}
      </Button>
    </form>
  );
}

/** The group's chat as its doctor sees it. */
function DoctorChat({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const view = useGroupView(groupId);
  if (view.isPending) {
    return <Spinner size="2rem" />;
  }
  if (view.isError) {
    return (
      <Alert tone="danger" live>
        {describeApiError(t, view.error)}
      </Alert>
    );
  }
  return <GroupChat view={view.data} />;
}

/** One group of the signed-in doctor: share it, change it, and look after its students. */
export function GroupPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const languageName = useLanguageName();
  const { groupId = '' } = useParams();
  const groups = useDoctorGroups();
  const restore = useGroupCommand(groupId, 'restore');
  // The open tab lives in the address, so a reload or a shared link lands on the same one.
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab');

  if (groups.isPending) {
    return (
      <Container className={styles.page}>
        <Spinner size="2.5rem" />
      </Container>
    );
  }
  if (groups.isError) {
    return (
      <Container className={styles.page}>
        <Alert tone="danger" live>
          {describeApiError(t, groups.error)}
        </Alert>
      </Container>
    );
  }
  const group = groups.data.find((candidate) => candidate.id === groupId);
  if (!group) {
    return <NotFoundPage />;
  }

  return (
    <>
      <PageTitle>{group.name}</PageTitle>
      <Container className={styles.page}>
        <Link to="/app#groups" className={styles.back}>
          <ArrowRightIcon className="mirror-in-rtl" aria-hidden="true" />
          {t('groups.back')}
        </Link>

        <header className={styles.pageHead}>
          <GroupPhoto
            photoUrl={group.photoUrl}
            language={group.language}
            size="lg"
            active={!group.archived}
          />
          <div className={styles.pageTitleBlock}>
            <h1 className={styles.pageTitle}>{group.name}</h1>
            <p className={styles.muted}>{languageName(group.language)}</p>
            {group.description && <p>{group.description}</p>}
            <div className={styles.badges}>
              {group.archived && <Badge>{t('groups.archived')}</Badge>}
              {!group.archived && !group.joinOpen && (
                <Badge tone="warning">{t('groups.closed')}</Badge>
              )}
              {!group.archived && group.requiresApproval && (
                <Badge tone="info">{t('groups.approval')}</Badge>
              )}
            </div>
          </div>
        </header>

        {group.archived ? (
          <Alert tone="info">
            <span className={styles.archivedNotice}>
              {t('groups.archivedNotice')}
              <Button
                size="sm"
                variant="secondary"
                loading={restore.isPending}
                onClick={() => {
                  restore.mutate(undefined, {
                    onSuccess: () => {
                      toast({ tone: 'success', title: t('groups.restored') });
                    },
                    onError: (error) => {
                      toast({ tone: 'danger', title: describeApiError(t, error) });
                    },
                  });
                }}
              >
                {t('groups.restore')}
              </Button>
            </span>
          </Alert>
        ) : (
          <div className={styles.panels}>
            <SharePanel group={group} />
            <SettingsPanel group={group} />
          </div>
        )}

        <Tabs
          label={group.name}
          selectedTabId={
            tab === 'chat' || tab === 'students'
              ? tab
              : group.counts.pending > 0
                ? 'students'
                : 'chat'
          }
          onSelect={(id) => {
            setSearch({ tab: id }, { replace: true });
          }}
          tabs={[
            {
              id: 'chat',
              label:
                group.unread > 0
                  ? `${t('groups.tabChat')} (${String(group.unread)})`
                  : t('groups.tabChat'),
              content: <DoctorChat groupId={group.id} />,
            },
            {
              id: 'students',
              label: t('groups.tabStudents'),
              content: (
                <section className={styles.section} aria-labelledby="group-members">
                  <h2 id="group-members" className="visually-hidden">
                    {t('groups.membersLabel')}
                  </h2>
                  {!group.archived && (
                    <Card>
                      <h3 className={styles.cardTitle}>{t('groups.addTitle')}</h3>
                      <AddMemberForm group={group} />
                    </Card>
                  )}
                  <MembersPanel group={group} />
                </section>
              ),
            },
          ]}
        />
      </Container>
    </>
  );
}
