import {
  UNIVERSITY_EMAIL_DOMAIN,
  doctorOnboardingResponseSchema,
  doctorOnboardingSchema,
  meResponseSchema,
  type DoctorOnboardingRequest,
  type LearningLanguage,
  type SessionUser,
} from '@acu/shared';
import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { LanguagePicker } from '../../components/language/LanguagePicker';
import { Container } from '../../components/layout/Container';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { CodeInput } from '../../components/ui/CodeInput';
import { IconButton } from '../../components/ui/IconButton';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/toast/toast-context';
import { ApiError, apiRequest } from '../../lib/api';
import { useCountdown } from '../../lib/use-countdown';
import { PageTitle } from '../../pages/PageTitle';
import { SESSION_QUERY_KEY, useSetSession } from '../auth/session';
import {
  doctorDetailsProblems,
  emailCodeProblem,
  fieldMessage,
  type DoctorField,
  type FormProblems,
} from './doctor-errors';
import { SetupHeader } from './SetupHeader';
import styles from './Onboarding.module.css';

const CODE_LENGTH = 6;

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}${'•'.repeat(Math.min(Math.max(local.length - 1, 1), 6))}@${domain}`;
}

/**
 * Wraps left-to-right text (an email) in Unicode isolate marks so an Arabic sentence around it
 * cannot reorder its characters.
 */
function isolateLtr(text: string): string {
  return `⁦${text}⁩`;
}

function initialDetails(user: SessionUser): Record<DoctorField, string> {
  const googleIsUniversity = user.email.endsWith(`@${UNIVERSITY_EMAIL_DOMAIN}`);
  return {
    accessCode: '',
    staffId: user.doctor?.staffId ?? '',
    displayName: user.doctor?.displayName ?? '',
    universityEmail: user.doctor?.universityEmail ?? (googleIsUniversity ? user.email : ''),
  };
}

export function DoctorSetupPage({ user }: { user: SessionUser }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setSession = useSetSession();
  const showToast = useToast();
  const cooldown = useCountdown();

  const pending = user.doctor?.status === 'pending_verification';
  const [step, setStep] = useState<'details' | 'verify'>(pending ? 'verify' : 'details');
  const [details, setDetails] = useState(() => initialDetails(user));
  const [languages, setLanguages] = useState<LearningLanguage[]>(user.doctor?.languages ?? []);
  const [languagesMissing, setLanguagesMissing] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [problems, setProblems] = useState<FormProblems>({ fields: {}, form: null });
  const [sentTo, setSentTo] = useState(
    pending && user.doctor ? maskEmail(user.doctor.universityEmail) : '',
  );
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const finish = async () => {
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    void navigate('/app', { replace: true });
  };

  const register = useMutation({
    mutationFn: (body: DoctorOnboardingRequest) =>
      apiRequest('/api/onboarding/doctor', {
        method: 'POST',
        body,
        schema: doctorOnboardingResponseSchema,
      }),
    onSuccess: async (result) => {
      if (result.status === 'active') {
        await finish();
        return;
      }
      setSentTo(result.sentTo ?? maskEmail(details.universityEmail));
      cooldown.start(result.resendAvailableInSeconds);
      setCode('');
      setCodeError(null);
      setStep('verify');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'RESEND_TOO_SOON') {
        // A code was sent moments ago: continue with that one.
        setSentTo(maskEmail(details.universityEmail));
        cooldown.start(error.detail('retryAfterSeconds') ?? 60);
        setStep('verify');
        return;
      }
      if (error instanceof ApiError && 'languages' in error.fields) {
        setLanguagesMissing(true);
      }
      setProblems(doctorDetailsProblems(t, error));
    },
  });

  const verify = useMutation({
    mutationFn: (value: string) =>
      apiRequest('/api/onboarding/doctor/verify', {
        method: 'POST',
        body: { code: value },
        schema: meResponseSchema,
      }),
    onSuccess: ({ user: updated }) => {
      setSession(updated);
      void navigate('/app', { replace: true });
    },
    onError: (error) => {
      const problem = emailCodeProblem(t, error);
      setCode('');
      setCodeError(problem.message);
      if (problem.backToDetails) {
        setStep('details');
        setProblems({ fields: {}, form: problem.message });
      }
    },
  });

  const resend = useMutation({
    mutationFn: () =>
      apiRequest('/api/onboarding/doctor/resend', {
        method: 'POST',
        schema: doctorOnboardingResponseSchema,
      }),
    onSuccess: (result) => {
      cooldown.start(result.resendAvailableInSeconds);
      setCode('');
      setCodeError(null);
      showToast({ title: t('doctorSetup.resent'), tone: 'success' });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'RESEND_TOO_SOON') {
        cooldown.start(error.detail('retryAfterSeconds') ?? 60);
        return;
      }
      setCodeError(emailCodeProblem(t, error).message);
    },
  });

  function updateField(field: DoctorField, value: string) {
    setDetails((current) => ({ ...current, [field]: value }));
    if (problems.fields[field]) {
      setProblems((current) => ({ ...current, fields: { ...current.fields, [field]: undefined } }));
    }
  }

  function handleDetailsSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = doctorOnboardingSchema.safeParse({ ...details, languages });
    if (!parsed.success) {
      const fields: FormProblems['fields'] = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        if (field === 'languages') {
          setLanguagesMissing(true);
        } else {
          fields[field as DoctorField] ??= fieldMessage(t, field);
        }
      }
      setProblems({ fields, form: null });
      return;
    }
    setProblems({ fields: {}, form: null });
    register.mutate(parsed.data);
  }

  function submitCode(value: string) {
    if (value.length !== CODE_LENGTH || verify.isPending) {
      return;
    }
    setCodeError(null);
    verify.mutate(value);
  }

  return (
    <>
      <PageTitle>{t('doctorSetup.title')}</PageTitle>
      <Container className={styles.page}>
        {step === 'details' ? (
          <>
            <SetupHeader
              step={2}
              total={3}
              title={t('doctorSetup.title')}
              lead={t('doctorSetup.lead')}
              backTo="/welcome"
            />
            <form className={styles.form} onSubmit={handleDetailsSubmit} noValidate>
              {problems.form && (
                <Alert tone="danger" live>
                  {problems.form}
                </Alert>
              )}
              <div className={styles.formGrid}>
                <div className={styles.fullRow}>
                  <div className={styles.secretField}>
                    <TextField
                      label={t('doctorSetup.accessCode')}
                      hint={t('doctorSetup.accessCodeHint')}
                      error={problems.fields.accessCode}
                      type={showCode ? 'text' : 'password'}
                      autoComplete="off"
                      spellCheck={false}
                      dir="ltr"
                      value={details.accessCode}
                      onChange={(event) => {
                        updateField('accessCode', event.target.value);
                      }}
                    />
                    <IconButton
                      className={styles.revealButton}
                      size="sm"
                      label={showCode ? t('doctorSetup.hideCode') : t('doctorSetup.showCode')}
                      icon={showCode ? <EyeSlashIcon /> : <EyeIcon />}
                      aria-pressed={showCode}
                      onClick={() => {
                        setShowCode((visible) => !visible);
                      }}
                    />
                  </div>
                </div>
                <TextField
                  label={t('doctorSetup.staffId')}
                  hint={t('doctorSetup.staffIdHint')}
                  error={problems.fields.staffId}
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  value={details.staffId}
                  onChange={(event) => {
                    updateField('staffId', event.target.value);
                  }}
                />
                <TextField
                  label={t('doctorSetup.displayName')}
                  hint={t('doctorSetup.displayNameHint')}
                  error={problems.fields.displayName}
                  autoComplete="name"
                  value={details.displayName}
                  onChange={(event) => {
                    updateField('displayName', event.target.value);
                  }}
                />
                <div className={styles.fullRow}>
                  <LanguagePicker
                    multiple
                    value={languages}
                    onChange={(next) => {
                      setLanguages(next);
                      if (next.length > 0) {
                        setLanguagesMissing(false);
                      }
                    }}
                    name="taught-languages"
                    legend={t('doctorSetup.languagesLegend')}
                    error={languagesMissing ? t('doctorSetup.noLanguage') : undefined}
                  />
                </div>
                <TextField
                  className={styles.fullRow}
                  label={t('doctorSetup.universityEmail')}
                  hint={t('doctorSetup.universityEmailHint')}
                  error={problems.fields.universityEmail}
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  placeholder={`name@${UNIVERSITY_EMAIL_DOMAIN}`}
                  value={details.universityEmail}
                  onChange={(event) => {
                    updateField('universityEmail', event.target.value);
                  }}
                />
              </div>
              <div className={styles.actions}>
                <Button type="submit" size="lg" loading={register.isPending}>
                  {t('doctorSetup.submit')}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <SetupHeader
              step={3}
              total={3}
              title={t('doctorSetup.verifyTitle')}
              lead={t('doctorSetup.verifyLead', { email: isolateLtr(sentTo) })}
            />
            <form
              className={`${styles.form} ${styles.verify}`}
              onSubmit={(event) => {
                event.preventDefault();
                submitCode(code);
              }}
              noValidate
            >
              <CodeInput
                label={t('doctorSetup.codeLabel')}
                length={CODE_LENGTH}
                value={code}
                onChange={(value) => {
                  setCode(value);
                  setCodeError(null);
                }}
                onComplete={submitCode}
                error={codeError ?? undefined}
                disabled={verify.isPending}
                autoFocus
              />
              <div className={styles.actions}>
                <Button
                  type="submit"
                  size="lg"
                  loading={verify.isPending}
                  disabled={code.length !== CODE_LENGTH}
                >
                  {t('doctorSetup.verify')}
                </Button>
              </div>
              <p className={styles.muted} aria-live="polite">
                {cooldown.remaining > 0 ? (
                  t('doctorSetup.resendIn', { seconds: cooldown.remaining })
                ) : (
                  <button
                    type="button"
                    className={styles.inlineLink}
                    onClick={() => {
                      resend.mutate();
                    }}
                    disabled={resend.isPending}
                  >
                    {t('doctorSetup.resend')}
                  </button>
                )}
              </p>
              <p className={styles.muted}>{t('doctorSetup.checkSpam')}</p>
              <button
                type="button"
                className={styles.inlineLink}
                onClick={() => {
                  setStep('details');
                }}
              >
                {t('doctorSetup.changeDetails')}
              </button>
            </form>
          </>
        )}
      </Container>
    </>
  );
}
