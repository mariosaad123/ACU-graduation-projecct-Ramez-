import type { LearningLanguage } from '@acu/shared';
import { useCallback, useMemo } from 'react';
import { useLocale } from './use-locale';

/** A learning language's name in the interface language, e.g. "الفرنسية" or "French". */
export function useLanguageName(): (language: LearningLanguage) => string {
  const { intlLocale } = useLocale();
  const displayNames = useMemo(
    () => new Intl.DisplayNames([intlLocale], { type: 'language' }),
    [intlLocale],
  );
  return useCallback((language) => displayNames.of(language) ?? language, [displayNames]);
}
