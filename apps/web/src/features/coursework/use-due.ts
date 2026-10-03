import { useMemo } from 'react';
import { useLocale } from '../../i18n/use-locale';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A deadline in full, and how far away it is, in the reader's language. */
export function useDue() {
  const { intlLocale } = useLocale();
  return useMemo(() => {
    const full = new Intl.DateTimeFormat(intlLocale, { dateStyle: 'full', timeStyle: 'short' });
    const relative = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' });
    return (iso: string) => {
      const date = new Date(iso);
      const left = date.getTime() - Date.now();
      const far = Math.abs(left) >= DAY_MS;
      return {
        full: full.format(date),
        relative: far
          ? relative.format(Math.round(left / DAY_MS), 'day')
          : relative.format(Math.round(left / (60 * 60 * 1000)), 'hour'),
        past: left < 0,
        soon: left >= 0 && left < 2 * DAY_MS,
      };
    };
  }, [intlLocale]);
}
