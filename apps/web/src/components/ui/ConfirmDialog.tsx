import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from './Alert';
import { Button } from './Button';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  /** Destructive actions confirm with a red button. */
  danger?: boolean;
  pending?: boolean;
  /** Shown inside the dialog, so a failure does not lose the context. */
  error?: string | null;
  children?: ReactNode;
}

/** Asks before an action that is hard to undo; stays open while it runs. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  danger = false,
  pending = false,
  error = null,
  children,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      description={description}
      dismissOnBackdrop={!pending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {(children !== undefined || error) && (
        <>
          {children}
          {error && (
            <Alert tone="danger" live>
              {error}
            </Alert>
          )}
        </>
      )}
    </Dialog>
  );
}
