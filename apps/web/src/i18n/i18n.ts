import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { applyDocumentLocale, storeLocale, type InterfaceLocale } from './config';
import { ar } from './messages/ar';
import { en } from './messages/en';

export const resources = {
  ar: { translation: ar },
  en: { translation: en },
} as const;

export function initI18n(locale: InterfaceLocale) {
  const instance = i18next.createInstance();

  void instance.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: 'ar',
    initAsync: false,
    interpolation: { escapeValue: false },
  });

  instance.on('languageChanged', (language) => {
    const next = language as InterfaceLocale;
    applyDocumentLocale(next);
    storeLocale(next);
  });

  applyDocumentLocale(locale);
  return instance;
}
