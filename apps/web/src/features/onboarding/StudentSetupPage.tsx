import {
  LEARNING_GOALS,
  meResponseSchema,
  universityIdPattern,
  type LearningGoal,
  type LearningLanguage,
} from '@acu/shared';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { LanguagePicker } from '../../components/language/LanguagePicker';
import { Container } from '../../components/layout/Container';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { RadioGroup } from '../../components/ui/RadioGroup';
import { TextField } from '../../components/ui/TextField';
import { useLanguageName } from '../../i18n/use-language-name';
import { ApiError, apiRequest } from '../../lib/api';
import { PageTitle } from '../../pages/PageTitle';
import { describeApiError } from '../auth/api-errors';
import { useSetSession } from '../auth/session';
import { SetupHeader } from './SetupHeader';
import styles from './Onboarding.module.css';

export function StudentSetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useSetSession();
  const languageName = useLanguageName();
  const pickerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const [universityId, setUniversityId] = useState('');
  const [idProblem, setIdProblem] = useState<'invalid' | 'taken' | null>(null);
  const [languages, setLanguages] = useState<LearningLanguage[]>([]);
  const [chosenStart, setChosenStart] = useState<LearningLanguage | null>(null);
  const [goal, setGoal] = useState<LearningGoal>('study');
  const [showLanguageError, setShowLanguageError] = useState(false);

  // The first language picked leads until the student chooses another, and a deselected
  // choice falls back to it.
  const startWith =
    chosenStart && languages.includes(chosenStart) ? chosenStart : (languages[0] ?? null);

  const submit = useMutation({
    mutationFn: (activeLanguage: LearningLanguage) =>
      apiRequest('/api/onboarding/student', {
        method: 'POST',
        body: { languages, activeLanguage, goal, universityId: universityId.trim() },
        schema: meResponseSchema,
      }),
    onSuccess: ({ user }) => {
      setSession(user);
      void navigate('/app', { replace: true });
    },
    onError: (error) => {
      // Said on the field itself, where it can be corrected.
      if (error instanceof ApiError && error.code === 'UNIVERSITY_ID_TAKEN') {
        setIdProblem('taken');
        idRef.current?.focus();
      }
    },
  });

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startWith) {
      setShowLanguageError(true);
      pickerRef.current?.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    if (!universityIdPattern.test(universityId.trim())) {
      setIdProblem('invalid');
      idRef.current?.focus();
      return;
    }
    submit.mutate(startWith);
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
          <div ref={pickerRef}>
            <LanguagePicker
              multiple
              value={languages}
              onChange={(next) => {
                setLanguages(next);
                if (next.length > 0) {
                  setShowLanguageError(false);
                }
              }}
              name="learning-languages"
              legend={t('languagePicker.labelMultiple')}
              error={showLanguageError ? t('studentSetup.noLanguage') : undefined}
            />
          </div>

          {languages.length > 1 && startWith && (
            <RadioGroup<LearningLanguage>
              legend={t('studentSetup.startLegend')}
              description={t('studentSetup.startHint')}
              name="start-language"
              value={startWith}
              onChange={setChosenStart}
              className={styles.goals}
              options={languages.map((language) => ({
                value: language,
                label: languageName(language),
              }))}
            />
          )}

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

          <TextField
            ref={idRef}
            label={t('profile.universityId')}
            hint={t('profile.universityIdHint')}
            error={
              idProblem === 'invalid'
                ? t('profile.universityIdError')
                : idProblem === 'taken'
                  ? t('errors.universityIdTaken')
                  : undefined
            }
            dir="ltr"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={20}
            value={universityId}
            onChange={(event) => {
              setUniversityId(event.target.value);
              setIdProblem(null);
            }}
          />

          {submit.isError && idProblem !== 'taken' && (
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
