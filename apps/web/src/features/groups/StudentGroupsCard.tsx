import { normalizeJoinCode, type SessionUser, type StudentGroup } from '@acu/shared';
import { ChatsCircleIcon, SignOutIcon } from '@phosphor-icons/react';
import { useEffect, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LoadError } from '../../components/ui/LoadError';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/toast/toast-context';
import { useLanguageName } from '../../i18n/use-language-name';
import { describeApiError } from '../auth/api-errors';
import { Avatar } from '../auth/Avatar';
import { useLeaveGroup, useStudentGroups } from './api';
import { GroupPhoto } from './GroupPhoto';
import { JoinGroupPanel } from './JoinGroupPanel';
import { clearPendingJoinCode, peekPendingJoinCode } from './pending-join';
import styles from './Groups.module.css';

type Student = NonNullable<SessionUser['student']>;

/** A student's groups on their dashboard: join with a code, see where they are, leave. */
export function StudentGroupsCard({ student }: { student: Student }) {
  const { t } = useTranslation();
  const toast = useToast();
  const languageName = useLanguageName();
  const groups = useStudentGroups();
  const leave = useLeaveGroup();
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState(false);
  // A code from a join link opened before signing in, or before setting up the account, opens
  // the join step once; it is then forgotten so a reload does not ask again.
  const [joining, setJoining] = useState<string | null>(peekPendingJoinCode);
  const [leaving, setLeaving] = useState<StudentGroup | null>(null);

  useEffect(() => {
    clearPendingJoinCode();
  }, []);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = normalizeJoinCode(input);
    if (!code) {
      setInputError(true);
      return;
    }
    setJoining(code);
  };

  return (
    <Card
      className={styles.myGroups}
      id="my-groups"
      role="region"
      aria-labelledby="my-groups-title"
    >
      <div>
        <h2 id="my-groups-title" className={styles.cardTitle}>
          {t('myGroups.title')}
        </h2>
        <p className={styles.muted}>{t('myGroups.lead')}</p>
      </div>

      <form className={styles.addForm} onSubmit={submit} noValidate>
        <TextField
          label={t('myGroups.codeLabel')}
          hint={t('myGroups.codeFormat')}
          error={inputError ? t('myGroups.codeFormat') : undefined}
          dir="ltr"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          placeholder="K7QM-9XRT"
          inputClassName={styles.codeInput}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setInputError(false);
          }}
        />
        <Button type="submit">{t('myGroups.find')}</Button>
      </form>

      {groups.isPending && <Skeleton shape="block" blockSize="4rem" />}
      {groups.isError && (
        <LoadError
          error={groups.error}
          retrying={groups.isFetching}
          onRetry={() => {
            void groups.refetch();
          }}
        />
      )}
      {groups.isSuccess && groups.data.length === 0 && (
        <p className={styles.emptyList}>{t('myGroups.empty')}</p>
      )}
      {groups.isSuccess && groups.data.length > 0 && (
        <ul className={styles.studentGroups}>
          {groups.data.map((group) => (
            <li key={group.id} className={styles.studentGroup}>
              <GroupPhoto photoUrl={group.photoUrl} language={group.language} />
              <div className={styles.groupTitle}>
                {group.status === 'active' ? (
                  <Link to={`/app/groups/${group.id}`} className={styles.groupLink}>
                    {group.name}
                  </Link>
                ) : (
                  <p className={styles.groupName}>{group.name}</p>
                )}
                <p className={styles.person}>
                  <Avatar
                    user={{ name: group.doctorName, avatarUrl: group.doctorAvatarUrl }}
                    size="1.5rem"
                  />
                  <span className={styles.muted}>
                    {group.doctorName} · {languageName(group.language)}
                  </span>
                </p>
                {group.status === 'pending' && <Badge tone="info">{t('myGroups.pending')}</Badge>}
                {group.unread > 0 && (
                  <Badge tone="emblem">{t('groups.unread', { count: group.unread })}</Badge>
                )}
                {group.unreadAnnouncements > 0 && (
                  <Badge tone="warning">
                    {t('groups.unreadAnnouncements', { count: group.unreadAnnouncements })}
                  </Badge>
                )}
                {group.role !== 'student' && <Badge tone="info">{t(`roles.${group.role}`)}</Badge>}
              </div>
              {group.status === 'active' && (
                <ButtonLink
                  to={`/app/groups/${group.id}`}
                  size="sm"
                  variant="secondary"
                  iconStart={<ChatsCircleIcon aria-hidden="true" />}
                  aria-label={t('myGroups.openGroup', { name: group.name })}
                >
                  {t('myGroups.enter')}
                </ButtonLink>
              )}
              <Button
                size="sm"
                variant="ghost"
                iconStart={<SignOutIcon className="mirror-in-rtl" aria-hidden="true" />}
                onClick={() => {
                  setLeaving(group);
                }}
              >
                {group.status === 'pending' ? t('myGroups.cancelRequest') : t('myGroups.leave')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={joining !== null}
        onClose={() => {
          setJoining(null);
        }}
        title={t('myGroups.previewTitle')}
      >
        {joining && (
          <JoinGroupPanel
            code={joining}
            student={student}
            onCancel={() => {
              setJoining(null);
            }}
            onDone={() => {
              setJoining(null);
              setInput('');
            }}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={leaving !== null}
        danger
        title={
          leaving?.status === 'pending'
            ? t('myGroups.cancelTitle', { name: leaving.name })
            : t('myGroups.leaveTitle', { name: leaving?.name ?? '' })
        }
        description={
          leaving?.status === 'pending' ? t('myGroups.cancelBody') : t('myGroups.leaveBody')
        }
        confirmLabel={
          leaving?.status === 'pending' ? t('myGroups.cancelRequest') : t('myGroups.leave')
        }
        pending={leave.isPending}
        error={leave.isError ? describeApiError(t, leave.error) : null}
        onClose={() => {
          setLeaving(null);
          leave.reset();
        }}
        onConfirm={() => {
          if (!leaving) {
            return;
          }
          leave.mutate(leaving.id, {
            onSuccess: () => {
              toast({
                tone: 'success',
                title:
                  leaving.status === 'pending'
                    ? t('myGroups.cancelled')
                    : t('myGroups.left', { name: leaving.name }),
              });
              setLeaving(null);
            },
          });
        }}
      />
    </Card>
  );
}
