import { LANGUAGES, type LearningLanguage, type SessionUser } from '@acu/shared';
import { CaretDownIcon, CheckIcon, SlidersHorizontalIcon } from '@phosphor-icons/react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LanguageGlyph } from '../../components/language/LanguageGlyph';
import { useToast } from '../../components/ui/toast/toast-context';
import { usePopover } from '../../components/ui/use-popover';
import { useLanguageName } from '../../i18n/use-language-name';
import { describeApiError } from '../auth/api-errors';
import { useSwitchLanguage } from './student-languages';
import styles from './ActiveLanguageSwitch.module.css';

type Student = NonNullable<SessionUser['student']>;

interface LanguageSwitchListProps {
  student: Student;
  /** After the current language is picked again, or another one is now active. */
  onDone?: () => void;
  /** When the "Manage your languages" link is followed. */
  onNavigate?: () => void;
}

/** A student's languages, the current one marked; picking another makes it the current one. */
export function LanguageSwitchList({ student, onDone, onNavigate }: LanguageSwitchListProps) {
  const { t } = useTranslation();
  const languageName = useLanguageName();
  const toast = useToast();
  const switchLanguage = useSwitchLanguage();
  const active = student.activeLanguage;

  const choose = (language: LearningLanguage) => {
    if (language === active) {
      onDone?.();
      return;
    }
    switchLanguage.mutate(language, {
      onSuccess: () => {
        onDone?.();
        toast({
          tone: 'success',
          title: t('languages.switched', { language: languageName(language) }),
        });
      },
      onError: (error) => {
        toast({ tone: 'danger', title: describeApiError(t, error) });
      },
    });
  };

  return (
    <>
      <p className={styles.heading}>{t('languages.switcher')}</p>
      <ul className={styles.list}>
        {student.languages.map((language) => {
          const isActive = language === active;
          const pending = switchLanguage.isPending && switchLanguage.variables === language;
          return (
            <li key={language}>
              <button
                type="button"
                className={styles.item}
                aria-current={isActive ? 'true' : undefined}
                aria-busy={pending || undefined}
                disabled={switchLanguage.isPending}
                onClick={() => {
                  choose(language);
                }}
              >
                <LanguageGlyph language={language} size="sm" active={isActive} />
                <span className={styles.itemText}>
                  <span lang={language} dir={LANGUAGES[language].direction}>
                    {LANGUAGES[language].nativeName}
                  </span>
                  <span className={styles.itemTranslation}>{languageName(language)}</span>
                </span>
                {isActive && (
                  <CheckIcon className={styles.check} weight="bold" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <Link to="/app#languages" className={styles.manage} onClick={onNavigate}>
        <SlidersHorizontalIcon aria-hidden="true" />
        {t('languages.manage')}
      </Link>
    </>
  );
}

/** The header button that shows a student's current language and opens their list. */
export function ActiveLanguageSwitch({
  student,
  className,
}: {
  student: Student;
  className?: string;
}) {
  const { t } = useTranslation();
  const languageName = useLanguageName();
  const { open, close, toggle, panelId, containerRef, buttonRef, onKeyDown } = usePopover();
  const active = student.activeLanguage;

  return (
    <div ref={containerRef} className={clsx(styles.switch, className)} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('languages.switcherLabel', { language: languageName(active) })}
        onClick={toggle}
      >
        <LanguageGlyph language={active} size="sm" active />
        <span className={styles.triggerName} lang={active} dir={LANGUAGES[active].direction}>
          {LANGUAGES[active].nativeName}
        </span>
        <CaretDownIcon className={styles.caret} aria-hidden="true" />
      </button>

      <div id={panelId} className={styles.panel} hidden={!open}>
        <LanguageSwitchList
          student={student}
          onDone={() => {
            close();
            buttonRef.current?.focus();
          }}
          onNavigate={close}
        />
      </div>
    </div>
  );
}
