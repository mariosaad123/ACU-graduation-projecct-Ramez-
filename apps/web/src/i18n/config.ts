import { INTERFACE_LOCALES, isInterfaceLocale, type InterfaceLocale } from '@acu/shared';

export { INTERFACE_LOCALES, type InterfaceLocale };

export const DEFAULT_LOCALE: InterfaceLocale = 'ar';

const STORAGE_KEY = 'acu.locale';

const DIRECTIONS: Record<InterfaceLocale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  en: 'ltr',
};

/** BCP 47 tags used for Intl formatting. Arabic keeps Latin digits across the interface. */
export const INTL_LOCALES: Record<InterfaceLocale, string> = {
  ar: 'ar-EG-u-nu-latn',
  en: 'en-GB',
};

export function directionOf(locale: InterfaceLocale): 'rtl' | 'ltr' {
  return DIRECTIONS[locale];
}

function readStoredLocale(): InterfaceLocale | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && isInterfaceLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: InterfaceLocale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); the choice then lasts for the session.
  }
}

export function detectInitialLocale(): InterfaceLocale {
  return readStoredLocale() ?? DEFAULT_LOCALE;
}

export function applyDocumentLocale(locale: InterfaceLocale): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = directionOf(locale);
}
