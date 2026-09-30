import {
  LEARNING_GOALS,
  meResponseSchema,
  type LearningGoal,
  type LearningLanguage,
} from '@acu/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { LanguagePicker } from '../../components/language/LanguagePicker';
import { Container } from '../../components/layout/Container';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { RadioGroup } from '../../components/ui/RadioGroup';
import { apiRequest } from '../../lib/api';
import { PageTitle } from '../../pages/PageTitle';
import { describeApiError } from '../auth/api-errors';
import { useSetSession } from '../auth/session';
import { SetupHeader } from './SetupHeader';
import styles from './Onboarding.module.css';

export function StudentSetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useSetSession();
  const [language, setLanguage] = useState<LearningLanguage>('en');
  const [goal, setGoal] = useState<LearningGoal>('study');

  const submit = useMutation({
    mutationFn: () =>
      apiRequest('/api/onboarding/student', {
        method: 'POST',
        body: { learningLanguage: language, goal },
        schema: meResponseSchema,
      }),
    onSuccess: ({ user }) => {
      setSession(user);
      void navigate('/app', { replace: true });
    },
  });

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    submit.mutate();
  }

  return (
    <>
      <PageTitle>{t('studentSetup.title')}</PageTitle>
      <Container className={styles.page}>
        <SetupHeader
          step={2}
          total={2}
          title={t('studentSetup.title')}
          lead={t('studentSetup.lead')}
          backTo="/welcome"
        />

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <LanguagePicker value={language} onChange={setLanguage} name="learning-language" />

          <RadioGroup<LearningGoal>
            legend={t('studentSetup.goalLegend')}
            name="goal"
            value={goal}
            onChange={setGoal}
            className={styles.goals}
            options={LEARNING_GOALS.map((value) => ({
              value,
              label: t(`studentSetup.goals.${value}.label`),
              hint: t(`studentSetup.goals.${value}.hint`),
            }))}
          />

          {submit.isError && (
            <Alert tone="danger" live>
              {describeApiError(t, submit.error)}
            </Alert>
          )}

          <div className={styles.actions}>
            <Button type="submit" size="lg" loading={submit.isPending}>
              {t('studentSetup.submit')}
            </Button>
          </div>
        </form>
      </Container>
    </>
  );
}
