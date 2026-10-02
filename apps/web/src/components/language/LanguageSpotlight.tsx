import { LANGUAGES, type LearningLanguage } from '@acu/shared';
import { ArrowRightIcon, PlusIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { landingPathFor, useSession } from '../../features/auth/session';
import { describeApiError } from '../../features/auth/api-errors';
import { useAddLanguage, useSwitchLanguage } from '../../features/languages/student-languages';
import { useLanguageName } from '../../i18n/use-language-name';
import { Button } from '../ui/Button';
import { ButtonLink } from '../ui/ButtonLink';
import { useToast } from '../ui/toast/toast-context';
import styles from './LanguageSpotlight.module.css';

type Script = 'arabic' | 'latin' | 'chinese' | 'japanese';

/** Facts that hold for the language itself, whatever the interface language. */
const FACTS: Record<
  LearningLanguage,
  { greeting: string; script: Script; scale?: 'hsk' | 'jlpt' }
> = {
  ar: { greeting: 'مرحبًا', script: 'arabic' },
  en: { greeting: 'Hello', script: 'latin' },
  fr: { greeting: 'Bonjour', script: 'latin' },
  de: { greeting: 'Hallo', script: 'latin' },
  zh: { greeting: '你好', script: 'chinese', scale: 'hsk' },
  ja: { greeting: 'こんにちは', script: 'japanese', scale: 'jlpt' },
};

/** What the next step is for this language, for whoever is looking. */
function NextStep({ language }: { language: LearningLanguage }) {
  const { t } = useTranslation();
  const languageName = useLanguageName();
  const toast = useToast();
  const session = useSession();
  const addLanguage = useAddLanguage();
  const switchLanguage = useSwitchLanguage();
  const name = languageName(language);
  const user = session.data ?? null;
  const arrow = <ArrowRightIcon className="mirror-in-rtl" aria-hidden="true" />;

  if (session.isPending) {
    return null;
  }
  if (!user) {
    return (
      <ButtonLink to="/sign-in" iconEnd={arrow}>
        {t('spotlight.visitor', { language: name })}
      </ButtonLink>
    );
  }
  if (!user.role) {
    return (
      <ButtonLink to={landingPathFor(user)} iconEnd={arrow}>
        {t('spotlight.finishSetup')}
      </ButtonLink>
    );
  }
  if (user.role === 'doctor' && user.doctor) {
    return user.doctor.languages.includes(language) ? (
      <ButtonLink to={`/app?newGroup=${language}`} iconStart={<PlusIcon aria-hidden="true" />}>
        {t('spotlight.doctorCreate', { language: name })}
      </ButtonLink>
    ) : (
      <ButtonLink to="/app#teaching" variant="secondary">
        {t('spotlight.doctorAddLanguage', { language: name })}
      </ButtonLink>
    );
  }
  if (user.role === 'student' && user.student) {
    const { student } = user;
    if (student.activeLanguage === language) {
      return (
        <ButtonLink to="/placement" iconEnd={arrow}>
          {t('spotlight.studentPlacement')}
        </ButtonLink>
      );
    }
    const onError = (error: unknown) => {
      toast({ tone: 'danger', title: describeApiError(t, error) });
    };
    return student.languages.includes(language) ? (
      <Button
        variant="secondary"
        loading={switchLanguage.isPending}
        onClick={() => {
          switchLanguage.mutate(language, {
            onSuccess: () => {
              toast({ tone: 'success', title: t('languages.switched', { language: name }) });
            },
            onError,
          });
        }}
      >
        {t('spotlight.studentSwitch', { language: name })}
      </Button>
    ) : (
      <Button
        iconStart={<PlusIcon aria-hidden="true" />}
        loading={addLanguage.isPending}
        onClick={() => {
          addLanguage.mutate(language, {
            onSuccess: () => {
              toast({ tone: 'success', title: t('languages.added', { language: name }) });
            },
            onError,
          });
        }}
      >
        {t('spotlight.studentAdd', { language: name })}
      </Button>
    );
  }
  return null;
}

/** Everything worth knowing about the language chosen in the picker, and where to go next. */
export function LanguageSpotlight({ language }: { language: LearningLanguage }) {
  const { t } = useTranslation();
  const languageName = useLanguageName();
  const facts = FACTS[language];
  const info = LANGUAGES[language];

  return (
    <section className={styles.spotlight} aria-labelledby="language-spotlight">
      <div className={styles.head}>
        <p className={styles.greeting} lang={language} dir={info.direction}>
          {facts.greeting}
        </p>
        <h2 id="language-spotlight" className={styles.title} aria-live="polite">
          {t('spotlight.title', { language: languageName(language) })}
        </h2>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>{t('spotlight.script')}</dt>
          <dd>
            {t(`spotlight.scripts.${facts.script}`)} · {t(`spotlight.direction.${info.direction}`)}
          </dd>
        </div>
        <div>
          <dt>{t('spotlight.levels')}</dt>
          <dd>
            {t('spotlight.cefr')}
            {facts.scale && <span className={styles.scale}>{t(`spotlight.${facts.scale}`)}</span>}
          </dd>
        </div>
        <div>
          <dt>{t('spotlight.skills')}</dt>
          <dd>{t('spotlight.skillsList')}</dd>
        </div>
      </dl>
      <div className={styles.action}>
        <NextStep language={language} />
      </div>
    </section>
  );
}
