import { CopyIcon, LinkIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/toast/toast-context';
import { copyText } from '../../lib/clipboard';

/** Copies a join code or link and says whether it worked. */
export function CopyButton({
  text,
  label,
  kind = 'code',
  size = 'sm',
}: {
  text: string;
  label: string;
  kind?: 'code' | 'link';
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const Icon = kind === 'link' ? LinkIcon : CopyIcon;

  return (
    <Button
      variant="secondary"
      size={size}
      iconStart={<Icon aria-hidden="true" />}
      onClick={() => {
        void copyText(text).then((copied) => {
          toast(
            copied
              ? { tone: 'success', title: t('groups.copied') }
              : { tone: 'warning', title: t('groups.copyFailed') },
          );
        });
      }}
    >
      {label}
    </Button>
  );
}
