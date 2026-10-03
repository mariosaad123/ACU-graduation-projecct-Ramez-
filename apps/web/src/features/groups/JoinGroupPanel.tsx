import type { TFunction } from 'i18next';
import { LANGUAGES, type SessionUser } from '@acu/shared';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toast/toast-context';
import { useLanguageName } from '../../i18n/use-language-name';
import { ApiError } from '../../lib/api';
import { describeApiError } from '../auth/api-errors';
import { Avatar } from '../auth/Avatar';
import { useJoinGroup, useJoinPreview } from './api';
import { GroupPhoto } from './GroupPhoto';
import styles from './Groups.module.css';

function joinErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError && error.code === 'TOO_MANY_ATTEMPTS') {
    return t('errors.tooManyJoinCodes');
  }
  if (error instanceof ApiError && error.code === 'INVALID_JOIN_CODE') {
    const attemptsLeft = error.detail('attemptsLeft');
    return attemptsLeft === undefined
      ? t('errors.invalidJoinCode')
      : `${t('errors.invalidJoinCode')} ${t('errors.attemptsLeft', { count: attemptsLeft })}`;
  }
  return describeApiError(t, error);
}

/**
 * Looks a code up, shows the group, then joins it on the student's confirmation. Used in the
 * dashboard's dialog and on the join link's page.
 */
export function JoinGroupPanel({
  code,
  student,
  onDone,
  onCancel,
}: {
  code: string;
  student: NonNullable<SessionUser['student']>;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const languageName = useLanguageName();
  const preview = useJoinPreview();
  const join = useJoinGroup();
  const { mutate: lookUp } = preview;
  const lookedUp = useRef<string | null>(null);

  // Once per code: a wrong code counts against the student's attempts, so it must not be
  // looked up twice (React runs effects twice in development).
  useEffect(() => {
    if (lookedUp.current === code) {
      return;
    }
    lookedUp.current = code;
    lookUp(code);
  }, [code, lookUp]);

  if (preview.isPending || preview.isIdle) {
    return <Spinner size="2rem" />;
  }
  if (preview.isError) {
    return (
      <div className={styles.joinPanel}>
        <Alert tone="danger" live>
          {joinErrorMessage(t, preview.error)}
        </Alert>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {t('common.close')}
          </Button>
        )}
      </div>
    );
  }

  const { group, membership } = preview.data;
  const addsLanguage = !student.languages.includes(group.language);

  return (
    <div className={styles.joinPanel}>
      <div className={styles.groupHead}>
        <GroupPhoto photoUrl={group.photoUrl} language={group.language} active />
        <div className={styles.groupTitle}>
          <p className={styles.groupName}>{group.name}</p>
          {group.description && <p className={styles.muted}>{group.description}</p>}
        </div>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>{t('myGroups.doctor')}</dt>
          <dd className={styles.person}>
            <Avatar
              user={{ name: group.doctorName, avatarUrl: group.doctorAvatarUrl }}
              size="1.75rem"
            />
            {group.doctorName}
          </dd>
        </div>
        <div>
          <dt>{t('myGroups.language')}</dt>
          <dd>
            {languageName(group.language)}{' '}
            <span lang={group.language} dir={LANGUAGES[group.language].direction}>
              ({LANGUAGES[group.language].nativeName})
            </span>
          </dd>
        </div>
      </dl>

      {membership === 'active' && <Alert tone="success">{t('myGroups.alreadyMember')}</Alert>}
      {membership === 'pending' && <Alert tone="info">{t('myGroups.alreadyPending')}</Alert>}
      {!membership && group.requiresApproval && (
        <Alert tone="info">{t('myGroups.approvalNote')}</Alert>
      )}
      {!membership && addsLanguage && (
        <p className={styles.muted}>
          {t('myGroups.languageNote', { language: languageName(group.language) })}
        </p>
      )}
      {join.isError && (
        <Alert tone="danger" live>
          {joinErrorMessage(t, join.error)}
        </Alert>
      )}

      <div className={styles.joinActions}>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={join.isPending}>
            {t('common.cancel')}
          </Button>
        )}
        {!membership && (
          <Button
            loading={join.isPending}
            onClick={() => {
              join.mutate(code, {
                onSuccess: (result) => {
                  const title =
                    result.status === 'pending'
                      ? t('myGroups.requested')
                      : result.languageAdded
                        ? t('myGroups.joinedWithLanguage', {
                            name: group.name,
                            language: languageName(group.language),
                          })
                        : t('myGroups.joined', { name: group.name });
                  toast({ tone: 'success', title });
                  onDone();
                },
              });
            }}
          >
            {group.requiresApproval ? t('myGroups.requestJoin') : t('myGroups.join')}
          </Button>
        )}
      </div>
    </div>
  );
}
