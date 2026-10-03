import { useMemo } from 'react';
import { useLocale } from '../../i18n/use-locale';

/** Sizes as people read them: "320 kB", "2.4 MB", in the interface language. */
export function useFormatSize() {
  const { intlLocale } = useLocale();
  return useMemo(() => {
    const kilobytes = new Intl.NumberFormat(intlLocale, {
      style: 'unit',
      unit: 'kilobyte',
      maximumFractionDigits: 0,
    });
    const megabytes = new Intl.NumberFormat(intlLocale, {
      style: 'unit',
      unit: 'megabyte',
      maximumFractionDigits: 1,
    });
    return (bytes: number) =>
      bytes < 1024 * 1024
        ? kilobytes.format(Math.max(1, Math.round(bytes / 1024)))
        : megabytes.format(bytes / (1024 * 1024));
  }, [intlLocale]);
}
