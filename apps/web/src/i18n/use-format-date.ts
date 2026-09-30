import { useCallback, useMemo } from 'react';
import { useLocale } from './use-locale';

/** "30 سبتمبر 2026" or "30 September 2026", from an ISO timestamp sent by the API. */
export function useFormatDate(): (iso: string) => string {
  const { intlLocale } = useLocale();
  const format = useMemo(
    () => new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'long', year: 'numeric' }),
    [intlLocale],
  );
  return useCallback((iso) => format.format(new Date(iso)), [format]);
}
