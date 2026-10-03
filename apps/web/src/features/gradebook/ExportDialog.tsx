import { DownloadSimpleIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { RadioGroup } from '../../components/ui/RadioGroup';
import { useToast } from '../../components/ui/toast/toast-context';
import { useLocale } from '../../i18n/use-locale';
import { downloadFile } from '../../lib/download';
import { describeApiError } from '../auth/api-errors';
import styles from './Gradebook.module.css';

type Report = 'grades' | 'full' | 'activity' | 'all';

interface ExportDialogProps {
  /** The group to export; without one, every group of the doctor goes into one workbook. */
  groupId: string | null;
  onClose: () => void;
}

/** Chooses what goes into the Excel file and its language, then downloads it. */
export function ExportDialog({ groupId, onClose }: ExportDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { locale } = useLocale();
  const [report, setReport] = useState<Report>(groupId ? 'full' : 'all');
  const [language, setLanguage] = useState<'ar' | 'en'>(locale);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const download = async () => {
    setPending(true);
    setFailure(null);
    try {
      await downloadFile(
        report === 'all' || !groupId
          ? `/api/doctor/export?lang=${language}`
          : `/api/groups/${groupId}/export?report=${report}&lang=${language}`,
        'export.xlsx',
      );
      toast({ tone: 'success', title: t('export.done') });
      onClose();
    } catch (error) {
      setFailure(describeApiError(t, error));
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('export.title')}
      description={t('export.lead')}
      dismissOnBackdrop={!pending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button
            iconStart={<DownloadSimpleIcon aria-hidden="true" />}
            loading={pending}
            onClick={() => {
              void download();
            }}
          >
            {t('export.download')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {groupId && (
          <RadioGroup
            legend={t('export.report')}
            name="export-report"
            value={report}
            options={[
              { value: 'full', label: t('export.full'), hint: t('export.fullHint') },
              { value: 'grades', label: t('export.grades'), hint: t('export.gradesHint') },
              { value: 'activity', label: t('export.activity'), hint: t('export.activityHint') },
            ]}
            onChange={setReport}
          />
        )}
        {!groupId && <p>{t('export.allHint')}</p>}
        <RadioGroup
          legend={t('export.language')}
          name="export-language"
          value={language}
          options={[
            { value: 'ar', label: 'العربية' },
            { value: 'en', label: 'English' },
          ]}
          onChange={setLanguage}
        />
        {failure && (
          <Alert tone="danger" live>
            {failure}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
