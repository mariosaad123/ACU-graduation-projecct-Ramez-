import type { LearningLanguage, SessionUser } from '@acu/shared';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/toast/toast-context';
import { useLanguageName } from '../../i18n/use-language-name';
import { describeApiError } from '../auth/api-errors';
import { useRemoveLanguage } from './student-languages';

interface RemoveLanguageDialogProps {
  /** The language to remove; null keeps the dialog closed. */
  language: LearningLanguage | null;
  student: NonNullable<SessionUser['student']>;
  onClose: () => void;
}

export function RemoveLanguageDialog({ language, student, onClose }: RemoveLanguageDialogProps) {
  const { t } = useTranslation();
  const languageName = useLanguageName();
  const toast = useToast();
  const removeLanguage = useRemoveLanguage();

  const close = () => {
    removeLanguage.reset();
    onClose();
  };

  // Mirrors the API: removing the active language makes the first remaining one active.
  const next = student.languages.find((candidate) => candidate !== language);
  const removingActive = language === student.activeLanguage;
  const name = language ? languageName(language) : '';

  return (
    <Dialog
      open={language !== null}
      onClose={close}
      size="sm"
      title={t('languages.removeTitle', { language: name })}
      description={
        removingActive && next
          ? t('languages.removeActiveBody', { next: languageName(next) })
          : t('languages.removeBody')
      }
      dismissOnBackdrop={!removeLanguage.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={removeLanguage.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={removeLanguage.isPending}
            onClick={() => {
              if (!language) {
                return;
              }
              removeLanguage.mutate(language, {
                onSuccess: () => {
                  toast({ tone: 'success', title: t('languages.removed', { language: name }) });
                  close();
                },
              });
            }}
          >
            {t('languages.removeConfirm')}
          </Button>
        </>
      }
    >
      {removeLanguage.isError && (
        <Alert tone="danger" live>
          {describeApiError(t, removeLanguage.error)}
        </Alert>
      )}
    </Dialog>
  );
}
