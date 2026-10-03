import { meResponseSchema, universityIdSchema } from '@acu/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Container } from '../../components/layout/Container';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { apiRequest } from '../../lib/api';
import { PageTitle } from '../../pages/PageTitle';
import { describeApiError } from '../auth/api-errors';
import { useSetSession } from '../auth/session';
import styles from './ProfilePage.module.css';

/**
 * Asked once of a student whose account is older than the university number: grade sheets and
 * exports are keyed by it, so the rest of the platform waits behind this one field.
 */
export function UniversityIdStep() {
  const { t } = useTranslation();
  const setSession = useSetSession();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const save = useMutation({
    mutationFn: (universityId: string) =>
      apiRequest('/api/me/university-id', {
        method: 'PUT',
        body: { universityId },
        schema: meResponseSchema,
      }),
    onSuccess: ({ user }) => {
      setSession(user);
    },
  });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = universityIdSchema.safeParse({ universityId: value });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    save.mutate(parsed.data.universityId);
  };

  return (
    <>
      <PageTitle>{t('universityIdStep.title')}</PageTitle>
      <Container className={styles.step}>
        <Card className={styles.card}>
          <h1 className={styles.stepTitle}>{t('universityIdStep.title')}</h1>
          <p className={styles.stepLead}>{t('universityIdStep.lead')}</p>
          <form className={styles.stepForm} onSubmit={submit} noValidate>
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
              dir="ltr"
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={20}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setInvalid(false);
                save.reset();
              }}
            />
            <Button type="submit" size="lg" loading={save.isPending}>
              {t('universityIdStep.submit')}
            </Button>
          </form>
        </Card>
      </Container>
    </>
  );
}
