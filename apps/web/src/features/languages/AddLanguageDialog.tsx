import type { LearningLanguage } from '@acu/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguagePicker } from '../../components/language/LanguagePicker';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/toast/toast-context';
import { useLanguageName } from '../../i18n/use-language-name';
import { describeApiError } from '../auth/api-errors';
import { useAddLanguage } from './student-languages';

interface AddLanguageDialogProps {
  open: boolean;
  /** The student's languages: shown in the picker, but not selectable again. */
  enrolled: readonly LearningLanguage[];
  onClose: () => void;
}

export function AddLanguageDialog({ open, enrolled, onClose }: AddLanguageDialogProps) {
  const { t } = useTranslation();
  const languageName = useLanguageName();
  const toast = useToast();
  const addLanguage = useAddLanguage();
  const [language, setLanguage] = useState<LearningLanguage | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  // A language added elsewhere (another tab) must not stay selected here.
  const selected = language && !enrolled.includes(language) ? language : null;

  const close = () => {
    setLanguage(null);
    setShowMissing(false);
    addLanguage.reset();
    onClose();
  };

  const confirm = () => {
    if (!selected) {
      setShowMissing(true);
      return;
    }
    addLanguage.mutate(selected, {
      onSuccess: () => {
        toast({
          tone: 'success',
          title: t('languages.added', { language: languageName(selected) }),
        });
        close();
      },
    });
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('languages.addTitle')}
      description={t('languages.addLead')}
      dismissOnBackdrop={!addLanguage.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={addLanguage.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={confirm} loading={addLanguage.isPending}>
            {t('languages.addConfirm')}
          </Button>
        </>
      }
    >
      <LanguagePicker
        value={selected}
        onChange={(next) => {
          setLanguage(next);
          setShowMissing(false);
        }}
        name="add-language"
        legend={t('languages.addLegend')}
        unavailable={enrolled}
        unavailableNote={t('languages.alreadyAdded')}
        error={showMissing ? t('languages.pickOne') : undefined}
      />
      {addLanguage.isError && (
        <Alert tone="danger" live>
          {describeApiError(t, addLanguage.error)}
        </Alert>
      )}
    </Dialog>
  );
}
