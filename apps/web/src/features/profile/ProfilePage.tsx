import { meResponseSchema, universityIdSchema, type SessionUser } from '@acu/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Container } from '../../components/layout/Container';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { Card } from '../../components/ui/Card';
import { PhotoField } from '../../components/ui/PhotoField';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/toast/toast-context';
import { apiRequest } from '../../lib/api';
import { PageTitle } from '../../pages/PageTitle';
import { describeApiError } from '../auth/api-errors';
import { Avatar } from '../auth/Avatar';
import { useSetSession } from '../auth/session';
import styles from './ProfilePage.module.css';

function usePhotoMutations() {
  const setSession = useSetSession();
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiRequest('/api/me/avatar', { method: 'PUT', body: form, schema: meResponseSchema });
    },
    onSuccess: ({ user }) => {
      setSession(user);
    },
  });
  const remove = useMutation({
    mutationFn: () => apiRequest('/api/me/avatar', { method: 'DELETE', schema: meResponseSchema }),
    onSuccess: ({ user }) => {
      setSession(user);
    },
  });
  return { upload, remove };
}

/** The university's student number: optional, and seen by the student's doctors only. */
function UniversityIdCard({ current }: { current: string | null }) {
  const { t } = useTranslation();
  const toast = useToast();
  const setSession = useSetSession();
  const [value, setValue] = useState(current ?? '');
  const [invalid, setInvalid] = useState(false);
  const save = useMutation({
    mutationFn: (universityId: string | null) =>
      apiRequest('/api/me/university-id', {
        method: 'PUT',
        body: { universityId },
        schema: meResponseSchema,
      }),
    onSuccess: ({ user }) => {
      setSession(user);
      toast({ tone: 'success', title: t('profile.universityIdSaved') });
    },
  });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = universityIdSchema.safeParse({ universityId: value.trim() || null });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    save.mutate(parsed.data.universityId);
  };

  return (
    <Card className={styles.card}>
      <form className={styles.idForm} onSubmit={submit} noValidate>
        <TextField
          label={t('profile.universityId')}
          hint={t('profile.universityIdHint')}
          error={
            invalid
              ? t('profile.universityIdError')
              : save.isError
                ? describeApiError(t, save.error)
                : undefined
          }
          optional
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          maxLength={20}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setInvalid(false);
          }}
        />
        <Button
          type="submit"
          variant="secondary"
          loading={save.isPending}
          disabled={value.trim() === (current ?? '')}
        >
          {t('groups.save')}
        </Button>
      </form>
    </Card>
  );
}

/** The signed-in person's profile: their photo, used everywhere on the platform. */
export function ProfilePage({ user }: { user: SessionUser }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { upload, remove } = usePhotoMutations();
  const failure = upload.error ?? remove.error;

  return (
    <>
      <PageTitle>{t('profile.title')}</PageTitle>
      <Container className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t('profile.title')}</h1>
          <p className={styles.lead}>{t('profile.lead')}</p>
        </header>

        <Card className={styles.card}>
          <PhotoField
            label={t('photo.label')}
            preview={<Avatar user={user} size="6rem" />}
            hasPhoto={user.customAvatar}
            removeLabel={t('photo.removeCustom')}
            busy={upload.isPending || remove.isPending}
            error={failure ? describeApiError(t, failure) : null}
            onUpload={(file) => {
              remove.reset();
              upload.mutate(file, {
                onSuccess: () => {
                  toast({ tone: 'success', title: t('photo.saved') });
                },
              });
            }}
            onRemove={() => {
              upload.reset();
              remove.mutate(undefined, {
                onSuccess: () => {
                  toast({ tone: 'success', title: t('photo.removed') });
                },
              });
            }}
          />

          <dl className={styles.facts}>
            <div>
              <dt>{t('profile.name')}</dt>
              <dd>
                {user.name}
                <span className={styles.hint}>{t('profile.nameHint')}</span>
              </dd>
            </div>
            <div>
              <dt>{t('profile.email')}</dt>
              <dd>
                <span dir="ltr">{user.email}</span>
              </dd>
            </div>
            {user.role && (
              <div>
                <dt>{t('profile.role')}</dt>
                <dd>
                  <Badge tone="info">{t(`account.roles.${user.role}`)}</Badge>
                </dd>
              </div>
            )}
          </dl>
        </Card>

        {user.role === 'student' && user.student && (
          <UniversityIdCard
            key={user.student.universityId ?? ''}
            current={user.student.universityId}
          />
        )}

        <div className={styles.links}>
          <ButtonLink to={`/app/people/${user.id}`} variant="secondary">
            {t('profile.viewPublic')}
          </ButtonLink>
          <ButtonLink to="/app/notifications" variant="ghost">
            {t('profile.notifications')}
          </ButtonLink>
        </div>
      </Container>
    </>
  );
}
