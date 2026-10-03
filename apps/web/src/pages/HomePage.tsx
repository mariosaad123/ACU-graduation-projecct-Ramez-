import { CEFR_LEVELS, LANGUAGES, SKILLS, type LearningLanguage } from '@acu/shared';
import {
  ArrowRightIcon,
  BooksIcon,
  ChalkboardTeacherIcon,
  ChatsCircleIcon,
  CheckIcon,
  ExamIcon,
  GraduationCapIcon,
  StairsIcon,
  StudentIcon,
  TranslateIcon,
  UsersThreeIcon,
  type Icon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LanguagePicker } from '../components/language/LanguagePicker';
import { LanguageSpotlight } from '../components/language/LanguageSpotlight';
import { Container } from '../components/layout/Container';
import { buttonClassName } from '../components/ui/button-styles';
import { ButtonLink } from '../components/ui/ButtonLink';
import { SkillIcon } from '../components/ui/SkillIcon';
import { SkillTag } from '../components/ui/SkillTag';
import { landingPathFor, useSession } from '../features/auth/session';
import { PageTitle } from './PageTitle';
import styles from './HomePage.module.css';

/** "Hello" in each language taught, in the platform's order: the first thing a visitor reads. */
const GREETINGS: Record<LearningLanguage, string> = {
  ar: 'مرحبًا',
  en: 'Hello',
  fr: 'Bonjour',
  de: 'Hallo',
  es: '¡Hola!',
  zh: '你好',
  ja: 'こんにちは',
};

/** The parts of the platform besides the four skills, and whether each can be used today. */
const AREAS = [
  { id: 'placement', to: '/placement', icon: StairsIcon, ready: false },
  { id: 'groups', to: '/app', icon: UsersThreeIcon, ready: true },
  { id: 'translation', to: '/translation', icon: TranslateIcon, ready: false },
  { id: 'practice', to: '/practice', icon: ChatsCircleIcon, ready: false },
  { id: 'library', to: '/library', icon: BooksIcon, ready: false },
  { id: 'exams', to: '/exams', icon: ExamIcon, ready: false },
] as const satisfies readonly { id: string; to: string; icon: Icon; ready: boolean }[];

const AUDIENCES = [
  { id: 'student', icon: StudentIcon, points: ['one', 'two', 'three', 'four'] },
  { id: 'doctor', icon: ChalkboardTeacherIcon, points: ['one', 'two', 'three', 'four'] },
] as const;

const arrow = <ArrowRightIcon className="mirror-in-rtl" aria-hidden="true" />;

/** The way in: to sign in, to finish setting up, or back to one's own dashboard. */
function PrimaryAction() {
  const { t } = useTranslation();
  const session = useSession();
  const user = session.data ?? null;

  if (!user) {
    return (
      <ButtonLink to="/sign-in" size="lg" iconEnd={arrow}>
        {t('home.start')}
      </ButtonLink>
    );
  }
  return (
    <ButtonLink to={landingPathFor(user)} size="lg" iconEnd={arrow}>
      {user.role ? t('home.dashboard') : t('spotlight.finishSetup')}
    </ButtonLink>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  const [language, setLanguage] = useState<LearningLanguage>('en');

  return (
    <>
      <PageTitle />

      <Container className={styles.hero}>
        <div className={styles.intro}>
          <p className={styles.greetings} aria-hidden="true">
            {(Object.keys(GREETINGS) as LearningLanguage[]).map((code) => (
              <span
                key={code}
                lang={code}
                dir={LANGUAGES[code].direction}
                data-active={code === language}
              >
                {GREETINGS[code]}
              </span>
            ))}
          </p>
          <h1 className={styles.title}>{t('pages.home.title')}</h1>
          <p className={styles.lead}>{t('pages.home.lead')}</p>
          <div className={styles.actions}>
            <PrimaryAction />
            <a href="#journey" className={buttonClassName({ variant: 'secondary', size: 'lg' })}>
              {t('home.howItWorks')}
            </a>
          </div>
          <p className={styles.affiliation}>{t('pages.home.eyebrow')}</p>
        </div>
        <div className={styles.languages}>
          <LanguagePicker value={language} onChange={setLanguage} />
          <LanguageSpotlight language={language} />
        </div>
      </Container>

      <section id="journey" className={styles.journey} aria-labelledby="journey-title">
        <Container>
          <h2 id="journey-title" className={styles.sectionTitle}>
            {t('home.journey.title')}
          </h2>
          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                1
              </span>
              <h3 className={styles.stepTitle}>{t('home.journey.level.title')}</h3>
              <p>{t('home.journey.level.body')}</p>
              <p className={styles.ladder} role="img" aria-label={t('home.journey.level.ladder')}>
                {CEFR_LEVELS.map((level) => (
                  <span key={level} className={styles.rung}>
                    <span className={styles.rungBar} />
                    <span dir="ltr">{level}</span>
                  </span>
                ))}
              </p>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                2
              </span>
              <h3 className={styles.stepTitle}>{t('home.journey.practice.title')}</h3>
              <p>{t('home.journey.practice.body')}</p>
              <p className={styles.skillRow}>
                {SKILLS.map((skill) => (
                  <SkillTag key={skill} skill={skill} />
                ))}
              </p>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                3
              </span>
              <h3 className={styles.stepTitle}>{t('home.journey.follow.title')}</h3>
              <p>{t('home.journey.follow.body')}</p>
              <p className={styles.skillRow}>
                {(['chat', 'assignments', 'grades'] as const).map((item) => (
                  <span key={item} className={styles.chip}>
                    {t(`home.journey.follow.${item}`)}
                  </span>
                ))}
              </p>
            </li>
          </ol>
        </Container>
      </section>

      <section className={styles.areas} aria-labelledby="areas-title">
        <Container>
          <h2 id="areas-title" className={styles.sectionTitle}>
            {t('home.areas.title')}
          </h2>
          <p className={styles.sectionLead}>{t('home.areas.lead')}</p>

          <ul className={styles.skills}>
            {SKILLS.map((skill) => (
              <li key={skill}>
                <Link to="/skills" className={styles.skill} data-skill={skill}>
                  <SkillIcon skill={skill} className={styles.skillIcon} />
                  <span className={styles.blockTitle}>{t(`skills.${skill}`)}</span>
                  <span className={styles.blockBody}>{t(`home.skills.${skill}`)}</span>
                </Link>
              </li>
            ))}
          </ul>

          <ul className={styles.blocks}>
            {AREAS.map((area) => (
              <li key={area.id} data-area={area.id}>
                <Link to={area.to} className={styles.block}>
                  <area.icon className={styles.blockIcon} weight="duotone" aria-hidden="true" />
                  <span className={styles.blockTitle}>{t(`home.areas.${area.id}.title`)}</span>
                  <span className={styles.blockBody}>{t(`home.areas.${area.id}.body`)}</span>
                  <span className={styles.tag} data-ready={area.ready}>
                    {area.ready ? t('home.ready') : t('dashboard.soon')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className={styles.audiences} aria-labelledby="audiences-title">
        <Container>
          <h2 id="audiences-title" className={styles.sectionTitle}>
            {t('home.audiences.title')}
          </h2>
          <div className={styles.audienceGrid}>
            {AUDIENCES.map((audience) => (
              <article key={audience.id} className={styles.audience} data-audience={audience.id}>
                <h3 className={styles.audienceTitle}>
                  <audience.icon weight="duotone" aria-hidden="true" />
                  {t(`home.audiences.${audience.id}.title`)}
                </h3>
                <ul className={styles.points}>
                  {audience.points.map((point) => (
                    <li key={point}>
                      <CheckIcon weight="bold" aria-hidden="true" />
                      {t(`home.audiences.${audience.id}.${point}`)}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <Container className={styles.closing}>
        <GraduationCapIcon className={styles.closingIcon} weight="duotone" aria-hidden="true" />
        <p className={styles.closingText}>{t('home.closing')}</p>
        <div className={styles.actions}>
          <PrimaryAction />
          <ButtonLink to="/about" size="lg" variant="ghost">
            {t('footer.about')}
          </ButtonLink>
        </div>
      </Container>
    </>
  );
}
