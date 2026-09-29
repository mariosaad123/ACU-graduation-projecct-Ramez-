import { useLocale } from '../../i18n/use-locale';
import { DESIGN_SYSTEM_COPY } from './copy';

export type DesignSystemCopy = (typeof DESIGN_SYSTEM_COPY)['ar'];

export function useDesignSystemCopy(): DesignSystemCopy {
  const { locale } = useLocale();
  return DESIGN_SYSTEM_COPY[locale];
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
