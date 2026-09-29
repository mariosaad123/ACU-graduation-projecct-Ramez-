import { useTranslation } from 'react-i18next';

/** React 19 hoists <title> into <head>. */
export function PageTitle({ children }: { children?: string }) {
  const { t } = useTranslation();
  const brand = t('brand.name');
  return <title>{children ? `${children} | ${brand}` : brand}</title>;
}
