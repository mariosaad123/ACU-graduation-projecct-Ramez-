import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { Tabs } from '../../../components/ui/Tabs';
import { DsSection } from '../DsSection';
import type { DesignSystemCopy } from '../use-copy';
import styles from '../DesignSystemPage.module.css';

export function NavigationSection({ copy }: { copy: DesignSystemCopy }) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const text = copy.navigation;

  const close = () => {
    setDialogOpen(false);
  };

  return (
    <DsSection id="navigation" title={copy.sections.navigation}>
      <Tabs
        label={text.tabsLabel}
        tabs={(['text', 'vocabulary', 'questions'] as const).map((id) => ({
          id,
          label: text.tabs[id],
          content: <p className={styles.note}>{text.tabBody[id]}</p>,
        }))}
      />

      <div>
        <Button
          variant="secondary"
          onClick={() => {
            setDialogOpen(true);
          }}
        >
          {text.openDialog}
        </Button>
      </div>

      <Dialog
        open={dialogOpen}
        onClose={close}
        title={text.dialogTitle}
        description={text.dialogBody}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button onClick={close}>{text.dialogConfirm}</Button>
          </>
        }
      />
    </DsSection>
  );
}
