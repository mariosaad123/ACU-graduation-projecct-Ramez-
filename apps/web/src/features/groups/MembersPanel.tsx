import {
  GROUP_MEMBER_ROLES,
  suspendStudentSchema,
  type Group,
  type GroupMember,
  type GroupMemberRole,
} from '@acu/shared';
import {
  ArrowsLeftRightIcon,
  ArrowUUpLeftIcon,
  ChatCircleSlashIcon,
  CheckIcon,
  ProhibitIcon,
  ShieldStarIcon,
  UserMinusIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LanguageGlyph } from '../../components/language/LanguageGlyph';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tabs } from '../../components/ui/Tabs';
import { TextArea } from '../../components/ui/TextArea';
import { useToast } from '../../components/ui/toast/toast-context';
import { useFormatDate } from '../../i18n/use-format-date';
import { useLanguageName } from '../../i18n/use-language-name';
import { describeApiError } from '../auth/api-errors';
import { Avatar } from '../auth/Avatar';
import {
  useChatMute,
  useMemberRole,
  useDoctorGroups,
  useGroupMembers,
  useMemberAction,
  useMoveMember,
  useSuspension,
  type MemberAction,
} from './api';
import styles from './Groups.module.css';

type Dialogs =
  | { kind: 'remove'; member: GroupMember }
  | { kind: 'move'; member: GroupMember }
  | { kind: 'suspend'; member: GroupMember }
  | null;

const DONE_MESSAGE: Record<
  MemberAction,
  'groups.approved' | 'groups.rejected' | 'groups.removedMember' | 'groups.restoredMember'
> = {
  approve: 'groups.approved',
  reject: 'groups.rejected',
  remove: 'groups.removedMember',
  restore: 'groups.restoredMember',
};

function MemberRow({
  member,
  readOnly,
  busy,
  onAction,
  onDialog,
  onUnsuspend,
  onMute,
  onRole,
}: {
  member: GroupMember;
  readOnly: boolean;
  busy: boolean;
  onAction: (action: MemberAction) => void;
  onDialog: (dialog: NonNullable<Dialogs>['kind']) => void;
  onUnsuspend: () => void;
  onMute: (muted: boolean) => void;
  onRole: (role: GroupMemberRole) => void;
}) {
  const { t } = useTranslation();
  const languageName = useLanguageName();
  const formatDate = useFormatDate();
  const { student, status } = member;
  const suspension = student.suspension;

  const when =
    status === 'pending'
      ? t('groups.requestedOn', { date: formatDate(member.joinedAt) })
      : status === 'active'
        ? t('groups.joinedOn', { date: formatDate(member.decidedAt ?? member.joinedAt) })
        : member.leftByThemselves
          ? t('groups.leftOn', { date: formatDate(member.removedAt ?? member.joinedAt) })
          : t('groups.removedOn', { date: formatDate(member.removedAt ?? member.joinedAt) });

  return (
    <li className={styles.member}>
      <Avatar user={student} size="2.5rem" />
      <div className={styles.memberInfo}>
        <p className={styles.memberName}>
          <Link to={`/app/people/${student.id}`} className={styles.memberLink}>
            {student.name}
          </Link>
        </p>
        <p className={styles.memberEmail}>
          <span dir="ltr">{student.email}</span>
        </p>
        <p className={styles.muted}>{when}</p>
        {student.languages.length > 0 && (
          <ul
            className={styles.memberLanguages}
            aria-label={t('groups.languagesOf', { name: student.name })}
          >
            {student.languages.map((language) => (
              <li key={language} title={languageName(language)}>
                <LanguageGlyph
                  language={language}
                  size="sm"
                  active={language === student.activeLanguage}
                />
                <span className="visually-hidden">
                  {languageName(language)}
                  {language === student.activeLanguage ? ` (${t('languages.current')})` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        {status === 'active' && member.role !== 'student' && (
          <p className={styles.suspension}>
            <Badge tone="emblem" icon={<ShieldStarIcon aria-hidden="true" />}>
              {t(`roles.${member.role}`)}
            </Badge>
          </p>
        )}
        {status === 'active' && member.chatMuted && (
          <p className={styles.suspension}>
            <Badge tone="warning" icon={<ChatCircleSlashIcon aria-hidden="true" />}>
              {t('groups.muted')}
            </Badge>
          </p>
        )}
        {suspension && (
          <p className={styles.suspension}>
            <Badge tone="danger" icon={<ProhibitIcon aria-hidden="true" />}>
              {suspension.byMe
                ? t('groups.suspendedByMe')
                : suspension.byName
                  ? t('groups.suspendedBy', { name: suspension.byName })
                  : t('groups.suspendedByAdmin')}
            </Badge>
            {suspension.reason && (
              <span className={styles.muted}>
                {t('groups.reason', { reason: suspension.reason })}
              </span>
            )}
          </p>
        )}
      </div>

      <div className={styles.memberActions}>
        {!readOnly && status === 'pending' && (
          <>
            <Button
              size="sm"
              iconStart={<CheckIcon aria-hidden="true" />}
              disabled={busy}
              onClick={() => {
                onAction('approve');
              }}
            >
              {t('groups.approve')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              iconStart={<XIcon aria-hidden="true" />}
              disabled={busy}
              onClick={() => {
                onAction('reject');
              }}
            >
              {t('groups.reject')}
            </Button>
          </>
        )}
        {!readOnly && status === 'active' && (
          <>
            <label className={styles.roleSelect}>
              <span className="visually-hidden">{t('groups.roleOf', { name: student.name })}</span>
              <select
                value={member.role}
                disabled={busy}
                onChange={(event) => {
                  onRole(event.target.value as GroupMemberRole);
                }}
              >
                {GROUP_MEMBER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(`roles.${role}`)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              variant="secondary"
              iconStart={<ArrowsLeftRightIcon aria-hidden="true" />}
              disabled={busy}
              onClick={() => {
                onDialog('move');
              }}
            >
              {t('groups.move')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              iconStart={<UserMinusIcon aria-hidden="true" />}
              disabled={busy}
              onClick={() => {
                onDialog('remove');
              }}
            >
              {t('groups.remove')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              iconStart={<ChatCircleSlashIcon aria-hidden="true" />}
              aria-pressed={member.chatMuted}
              disabled={busy}
              onClick={() => {
                onMute(!member.chatMuted);
              }}
            >
              {member.chatMuted ? t('groups.unmute') : t('groups.mute')}
            </Button>
          </>
        )}
        {!readOnly && (status === 'removed' || status === 'left') && (
          <Button
            size="sm"
            variant="secondary"
            iconStart={<ArrowUUpLeftIcon className="mirror-in-rtl" aria-hidden="true" />}
            disabled={busy}
            onClick={() => {
              onAction('restore');
            }}
          >
            {t('groups.restoreMember')}
          </Button>
        )}
        {!suspension && (
          <Button
            size="sm"
            variant="ghost"
            iconStart={<ProhibitIcon aria-hidden="true" />}
            disabled={busy}
            onClick={() => {
              onDialog('suspend');
            }}
          >
            {t('groups.suspend')}
          </Button>
        )}
        {suspension?.byMe && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onUnsuspend}>
            {t('groups.unsuspend')}
          </Button>
        )}
      </div>
    </li>
  );
}

function MemberList({
  members,
  empty,
  ...rowProps
}: {
  members: GroupMember[];
  empty: string;
  readOnly: boolean;
  busyId: string | null;
  onAction: (member: GroupMember, action: MemberAction) => void;
  onDialog: (dialog: NonNullable<Dialogs>) => void;
  onUnsuspend: (member: GroupMember) => void;
  onMute: (member: GroupMember, muted: boolean) => void;
  onRole: (member: GroupMember, role: GroupMemberRole) => void;
}) {
  if (members.length === 0) {
    return <p className={styles.emptyList}>{empty}</p>;
  }
  return (
    <ul className={styles.members}>
      {members.map((member) => (
        <MemberRow
          key={member.student.id}
          member={member}
          readOnly={rowProps.readOnly}
          busy={rowProps.busyId === member.student.id}
          onAction={(action) => {
            rowProps.onAction(member, action);
          }}
          onDialog={(kind) => {
            rowProps.onDialog({ kind, member });
          }}
          onUnsuspend={() => {
            rowProps.onUnsuspend(member);
          }}
          onMute={(muted) => {
            rowProps.onMute(member, muted);
          }}
          onRole={(role) => {
            rowProps.onRole(member, role);
          }}
        />
      ))}
    </ul>
  );
}

function MoveDialog({
  group,
  member,
  onClose,
}: {
  group: Group;
  member: GroupMember;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const groups = useDoctorGroups();
  const move = useMoveMember(group.id);
  const targets = (groups.data ?? []).filter(
    (candidate) => candidate.id !== group.id && !candidate.archived,
  );
  const [target, setTarget] = useState('');
  const chosen = target || (targets[0]?.id ?? '');

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={t('groups.moveTitle', { name: member.student.name })}
      description={t('groups.moveHint')}
      dismissOnBackdrop={!move.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={move.isPending}>
            {t('common.cancel')}
          </Button>
          {targets.length > 0 && (
            <Button
              loading={move.isPending}
              onClick={() => {
                const destination = targets.find((candidate) => candidate.id === chosen);
                move.mutate(
                  { studentId: member.student.id, toGroupId: chosen },
                  {
                    onSuccess: () => {
                      toast({
                        tone: 'success',
                        title: t('groups.moved', {
                          name: member.student.name,
                          group: destination?.name ?? '',
                        }),
                      });
                      onClose();
                    },
                  },
                );
              }}
            >
              {t('groups.moveSubmit')}
            </Button>
          )}
        </>
      }
    >
      {targets.length === 0 ? (
        <Alert tone="info">{t('groups.noOtherGroups')}</Alert>
      ) : (
        <Select
          label={t('groups.moveLabel')}
          value={chosen}
          options={targets.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
          onChange={(event) => {
            setTarget(event.target.value);
          }}
        />
      )}
      {move.isError && (
        <Alert tone="danger" live>
          {describeApiError(t, move.error)}
        </Alert>
      )}
    </Dialog>
  );
}

function SuspendDialog({ member, onClose }: { member: GroupMember; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const suspension = useSuspension();
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);

  return (
    <ConfirmDialog
      open
      danger
      title={t('groups.suspendTitle', { name: member.student.name })}
      description={t('groups.suspendBody')}
      confirmLabel={t('groups.suspendConfirm')}
      pending={suspension.isPending}
      error={suspension.isError ? describeApiError(t, suspension.error) : null}
      onClose={onClose}
      onConfirm={() => {
        const parsed = suspendStudentSchema.safeParse({ reason });
        if (!parsed.success) {
          setInvalid(true);
          return;
        }
        suspension.mutate(
          { studentId: member.student.id, reason: parsed.data.reason },
          {
            onSuccess: () => {
              toast({
                tone: 'success',
                title: t('groups.suspendedDone', { name: member.student.name }),
              });
              onClose();
            },
          },
        );
      }}
    >
      <TextArea
        label={t('groups.reasonLabel')}
        hint={t('groups.reasonHint')}
        error={invalid ? t('groups.reasonError') : undefined}
        rows={3}
        maxLength={300}
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
          setInvalid(false);
        }}
      />
    </ConfirmDialog>
  );
}

/** The group's students in three tabs, with what the doctor can do for each. */
export function MembersPanel({ group }: { group: Group }) {
  const { t } = useTranslation();
  const toast = useToast();
  const members = useGroupMembers(group.id);
  const action = useMemberAction(group.id);
  const suspension = useSuspension();
  const chatMute = useChatMute(group.id);
  const memberRole = useMemberRole(group.id);
  const [dialog, setDialog] = useState<Dialogs>(null);

  const busyId =
    (action.isPending && action.variables.studentId) ||
    (suspension.isPending && suspension.variables.studentId) ||
    (chatMute.isPending && chatMute.variables.studentId) ||
    (memberRole.isPending && memberRole.variables.studentId) ||
    null;

  const run = (member: GroupMember, memberAction: MemberAction, onDone?: () => void) => {
    action.mutate(
      { studentId: member.student.id, action: memberAction },
      {
        onSuccess: () => {
          toast({
            tone: 'success',
            title: t(DONE_MESSAGE[memberAction], { name: member.student.name }),
          });
          onDone?.();
        },
        onError: (error) => {
          toast({ tone: 'danger', title: describeApiError(t, error) });
        },
      },
    );
  };

  const unsuspend = (member: GroupMember) => {
    suspension.mutate(
      { studentId: member.student.id, reason: null },
      {
        onSuccess: () => {
          toast({
            tone: 'success',
            title: t('groups.unsuspended', { name: member.student.name }),
          });
        },
        onError: (error) => {
          toast({ tone: 'danger', title: describeApiError(t, error) });
        },
      },
    );
  };

  const mute = (member: GroupMember, muted: boolean) => {
    chatMute.mutate(
      { studentId: member.student.id, muted },
      {
        onSuccess: () => {
          toast({
            tone: 'success',
            title: t(muted ? 'groups.mutedDone' : 'groups.unmutedDone', {
              name: member.student.name,
            }),
          });
        },
        onError: (error) => {
          toast({ tone: 'danger', title: describeApiError(t, error) });
        },
      },
    );
  };

  const changeRole = (member: GroupMember, role: GroupMemberRole) => {
    memberRole.mutate(
      { studentId: member.student.id, role },
      {
        onSuccess: () => {
          toast({
            tone: 'success',
            title: t('groups.roleChanged', { name: member.student.name, role: t(`roles.${role}`) }),
          });
        },
        onError: (error) => {
          toast({ tone: 'danger', title: describeApiError(t, error) });
        },
      },
    );
  };

  if (members.isPending) {
    return (
      <div className={styles.members} aria-busy="true">
        <Skeleton shape="block" blockSize="5rem" />
        <Skeleton shape="block" blockSize="5rem" />
      </div>
    );
  }
  if (members.isError) {
    return (
      <Alert tone="danger" live>
        {describeApiError(t, members.error)}
      </Alert>
    );
  }

  const byStatus = {
    active: members.data.filter((member) => member.status === 'active'),
    pending: members.data.filter((member) => member.status === 'pending'),
    out: members.data.filter((member) => member.status === 'removed' || member.status === 'left'),
  };
  const listProps = {
    readOnly: group.archived,
    busyId,
    onAction: (member: GroupMember, memberAction: MemberAction) => {
      run(member, memberAction);
    },
    onDialog: setDialog,
    onUnsuspend: unsuspend,
    onMute: mute,
    onRole: changeRole,
  };

  return (
    <>
      <Tabs
        label={t('groups.membersLabel')}
        defaultTabId={
          byStatus.pending.length > 0 && byStatus.active.length === 0 ? 'pending' : 'active'
        }
        tabs={[
          {
            id: 'active',
            label: t('groups.tabActive', { count: byStatus.active.length }),
            content: (
              <MemberList
                members={byStatus.active}
                empty={t('groups.emptyActive')}
                {...listProps}
              />
            ),
          },
          {
            id: 'pending',
            label: t('groups.tabPending', { count: byStatus.pending.length }),
            content: (
              <MemberList
                members={byStatus.pending}
                empty={t('groups.emptyPending')}
                {...listProps}
              />
            ),
          },
          {
            id: 'out',
            label: t('groups.tabOut', { count: byStatus.out.length }),
            content: (
              <MemberList members={byStatus.out} empty={t('groups.emptyOut')} {...listProps} />
            ),
          },
        ]}
      />

      {dialog?.kind === 'remove' && (
        <ConfirmDialog
          open
          danger
          title={t('groups.removeTitle', { name: dialog.member.student.name })}
          description={t('groups.removeBody')}
          confirmLabel={t('groups.remove')}
          pending={action.isPending}
          onClose={() => {
            setDialog(null);
          }}
          onConfirm={() => {
            run(dialog.member, 'remove', () => {
              setDialog(null);
            });
          }}
        />
      )}
      {dialog?.kind === 'move' && (
        <MoveDialog
          group={group}
          member={dialog.member}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'suspend' && (
        <SuspendDialog
          member={dialog.member}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
    </>
  );
}
