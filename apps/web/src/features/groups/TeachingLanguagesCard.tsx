import { LANGUAGES, type LearningLanguage } from '@acu/shared';
import { PencilSimpleIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageGlyph } from '../../components/language/LanguageGlyph';
import { LanguagePicker } from '../../components/language/LanguagePicker';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/toast/toast-context';
import { useLanguageName } from '../../i18n/use-language-name';
import { ApiError } from '../../lib/api';
import { describeApiError } from '../auth/api-errors';
import { useSetTeachingLanguages } from './api';
import styles from './Groups.module.css';

/** The languages a doctor teaches, which decide the languages their groups can be in. */
export function TeachingLanguagesCard({ languages }: { languages: LearningLanguage[] }) {
  const { t } = useTranslation();
  const languageName = useLanguageName();
  const toast = useToast();
  const save = useSetTeachingLanguages();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LearningLanguage[]>(languages);
  const [missing, setMissing] = useState(false);

  const open = () => {
    setDraft(languages);
    setMissing(false);
    save.reset();
    setEditing(true);
  };

  const close = () => {
    setEditing(false);
  };

  const submit = () => {
    if (draft.length === 0) {
      setMissing(true);
      return;
    }
    save.mutate(draft, {
      onSuccess: () => {
        toast({ tone: 'success', title: t('teaching.saved') });
        close();
      },
    });
  };

  const saveError =
    save.error instanceof ApiError && save.error.code === 'LANGUAGE_IN_USE'
      ? t('teaching.inUse')
      : save.isError
        ? describeApiError(t, save.error)
        : null;

  return (
    <Card className={styles.teaching} id="teaching">
      <div className={styles.cardHead}>
        <div>
          <h2 className={styles.cardTitle}>{t('teaching.title')}</h2>
          <p className={styles.muted}>{t('teaching.lead')}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          iconStart={<PencilSimpleIcon aria-hidden="true" />}
          onClick={open}
        >
          {t('teaching.edit')}
        </Button>
      </div>

      {languages.length === 0 ? (
        <Alert tone="warning">{t('teaching.missing')}</Alert>
      ) : (
        <ul className={styles.chips}>
          {languages.map((language) => (
            <li key={language} className={styles.chip}>
              <LanguageGlyph language={language} size="sm" />
              <span lang={language} dir={LANGUAGES[language].direction}>
                {LANGUAGES[language].nativeName}
              </span>
              <span className={styles.muted}>{languageName(language)}</span>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing}
        onClose={close}
        title={t('teaching.title')}
        description={t('teaching.lead')}
        dismissOnBackdrop={!save.isPending}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={save.isPending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              {t('teaching.save')}
            </Button>
          </>
        }
      >
        <LanguagePicker
          multiple
          value={draft}
          onChange={(next) => {
            setDraft(next);
            if (next.length > 0) {
              setMissing(false);
            }
          }}
          name="teaching-languages"
          legend={t('doctorSetup.languagesLegend')}
          error={missing ? t('doctorSetup.noLanguage') : undefined}
        />
        {saveError && (
          <Alert tone="danger" live>
            {saveError}
          </Alert>
        )}
      </Dialog>
    </Card>
  );
}
