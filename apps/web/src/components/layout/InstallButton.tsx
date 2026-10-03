import { DeviceMobileIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { useToast } from '../ui/toast/toast-context';
import styles from './InstallButton.module.css';

/** The event browsers fire when the site can be installed; not yet in TypeScript's own types. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Safari on iPhone and iPad installs from its share menu and never fires the install event. */
function needsManualInstall(): boolean {
  const apple =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true);
  return apple && !installed;
}

/**
 * Offers to install the platform as an app. The button appears only when the browser says it can
 * be installed and goes away once it has been, so it is never a button that does nothing.
 */
export function InstallButton() {
  const { t } = useTranslation();
  const toast = useToast();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [manual] = useState(needsManualInstall);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // The browser's own banner is held back; the button asks instead, when the person wants.
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      toast({ tone: 'success', title: t('install.done') });
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [t, toast]);

  if (prompt) {
    const ask = async () => {
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } finally {
        // A prompt can be shown once; the browser sends a new one if it is still installable.
        setPrompt(null);
      }
    };
    return (
      <Button
        size="sm"
        variant="secondary"
        iconStart={<DeviceMobileIcon aria-hidden="true" />}
        onClick={() => void ask()}
      >
        {t('install.button')}
      </Button>
    );
  }
  if (manual) {
    return <p className={styles.hint}>{t('install.iosHint')}</p>;
  }
  return null;
}
