import { TranslateIcon } from '@phosphor-icons/react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../i18n/use-locale';
import styles from './LocaleSwitch.module.css';

export function LocaleSwitch({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  const next = locale === 'ar' ? 'en' : 'ar';

  return (
    <button
      type="button"
      className={clsx(styles.localeSwitch, className)}
      lang={next}
      aria-label={t('locale.switchToLabel')}
      onClick={() => {
        setLocale(next);
      }}
    >
      <TranslateIcon aria-hidden="true" />
      <span>{t('locale.switchTo')}</span>
    </button>
  );
}
