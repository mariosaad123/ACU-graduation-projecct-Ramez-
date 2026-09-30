import {
  LANGUAGES,
  LEARNING_LANGUAGES,
  type LearningLanguage,
  type SessionUser,
} from '@acu/shared';
import { PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { LanguageGlyph } from '../../components/language/LanguageGlyph';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { IconButton } from '../../components/ui/IconButton';
import { useToast } from '../../components/ui/toast/toast-context';
import { useLanguageName } from '../../i18n/use-language-name';
import { describeApiError } from '../auth/api-errors';
import { AddLanguageDialog } from './AddLanguageDialog';
import { RemoveLanguageDialog } from './RemoveLanguageDialog';
import { useSwitchLanguage } from './student-languages';
import styles from './LanguagesCard.module.css';

type Student = NonNullable<SessionUser['student']>;

/** The dashboard's list of a student's languages: switch, add and remove. */
export function LanguagesCard({ student }: { student: Student }) {
  const { t } = useTranslation();
  const languageName = useLanguageName();
  const toast = useToast();
  const switchLanguage = useSwitchLanguage();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { hash } = useLocation();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<LearningLanguage | null>(null);

  // The header's "Manage your languages" link lands here.
  useEffect(() => {
    if (hash === '#languages') {
      titleRef.current?.scrollIntoView({ block: 'start' });
      titleRef.current?.focus();
    }
  }, [hash]);

  const canAdd = student.languages.length < LEARNING_LANGUAGES.length;
  const canRemove = student.languages.length > 1;

  const studyNow = (language: LearningLanguage) => {
    switchLanguage.mutate(language, {
      onSuccess: () => {
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
    <Card className={styles.card} id="languages" role="region" aria-labelledby={titleId}>
      <div className={styles.head}>
        <h2 id={titleId} ref={titleRef} tabIndex={-1} className={styles.title}>
          {t('languages.title')}
        </h2>
        <p className={styles.muted}>{t('languages.lead')}</p>
      </div>

      <ul className={styles.list}>
        {student.languages.map((language) => {
          const isActive = language === student.activeLanguage;
          const name = languageName(language);
          return (
            <li key={language} className={styles.row} data-active={isActive}>
              <LanguageGlyph language={language} active={isActive} />
              <span className={styles.names}>
                <span className={styles.native} lang={language} dir={LANGUAGES[language].direction}>
                  {LANGUAGES[language].nativeName}
                </span>
                <span className={styles.muted}>{name}</span>
              </span>
              <span className={styles.actions}>
                {isActive ? (
                  <Badge tone="emblem">{t('languages.current')}</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={t('languages.startThisLabel', { language: name })}
                    loading={switchLanguage.isPending && switchLanguage.variables === language}
                    disabled={switchLanguage.isPending}
                    onClick={() => {
                      studyNow(language);
                    }}
                  >
                    {t('languages.startThis')}
                  </Button>
                )}
                {canRemove && (
                  <IconButton
                    size="sm"
                    label={t('languages.remove', { language: name })}
                    icon={<TrashIcon />}
                    onClick={() => {
                      setRemoving(language);
                    }}
                  />
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <div className={styles.footer}>
        <p className={styles.muted}>
          {t('dashboard.student.goal')}: {t(`studentSetup.goals.${student.goal}.label`)}
        </p>
        {canAdd ? (
          <Button
            variant="secondary"
            iconStart={<PlusIcon aria-hidden="true" />}
            onClick={() => {
              setAdding(true);
            }}
          >
            {t('languages.add')}
          </Button>
        ) : (
          <p className={styles.muted}>{t('languages.allAdded')}</p>
        )}
      </div>

      <AddLanguageDialog
        open={adding}
        enrolled={student.languages}
        onClose={() => {
          setAdding(false);
        }}
      />
      <RemoveLanguageDialog
        language={removing}
        student={student}
        onClose={() => {
          setRemoving(null);
        }}
      />
    </Card>
  );
}
