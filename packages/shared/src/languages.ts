export const LEARNING_LANGUAGES = ['ar', 'en', 'fr', 'de', 'zh', 'ja'] as const;
export type LearningLanguage = (typeof LEARNING_LANGUAGES)[number];

export const INTERFACE_LOCALES = ['ar', 'en'] as const;
export type InterfaceLocale = (typeof INTERFACE_LOCALES)[number];

export type TextDirection = 'ltr' | 'rtl';

export interface LanguageInfo {
  code: LearningLanguage;
  englishName: string;
  nativeName: string;
  direction: TextDirection;
}

export const LANGUAGES: Readonly<Record<LearningLanguage, LanguageInfo>> = {
  ar: { code: 'ar', englishName: 'Arabic', nativeName: 'العربية', direction: 'rtl' },
  en: { code: 'en', englishName: 'English', nativeName: 'English', direction: 'ltr' },
  fr: { code: 'fr', englishName: 'French', nativeName: 'Français', direction: 'ltr' },
  de: { code: 'de', englishName: 'German', nativeName: 'Deutsch', direction: 'ltr' },
  zh: { code: 'zh', englishName: 'Chinese', nativeName: '中文', direction: 'ltr' },
  ja: { code: 'ja', englishName: 'Japanese', nativeName: '日本語', direction: 'ltr' },
};

export function isLearningLanguage(value: string): value is LearningLanguage {
  return (LEARNING_LANGUAGES as readonly string[]).includes(value);
}

export function isInterfaceLocale(value: string): value is InterfaceLocale {
  return (INTERFACE_LOCALES as readonly string[]).includes(value);
}
