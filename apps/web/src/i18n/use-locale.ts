import { isInterfaceLocale } from '@acu/shared';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LOCALE, INTL_LOCALES, directionOf, type InterfaceLocale } from './config';

export interface LocaleState {
  locale: InterfaceLocale;
  direction: 'rtl' | 'ltr';
  intlLocale: string;
  setLocale: (locale: InterfaceLocale) => void;
}

export function useLocale(): LocaleState {
  const { i18n } = useTranslation();
  const resolved = i18n.resolvedLanguage ?? '';
  const locale = isInterfaceLocale(resolved) ? resolved : DEFAULT_LOCALE;

  return {
    locale,
    direction: directionOf(locale),
    intlLocale: INTL_LOCALES[locale],
    setLocale: (next) => {
      void i18n.changeLanguage(next);
    },
  };
}
