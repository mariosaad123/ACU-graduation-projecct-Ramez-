import { useTranslation } from 'react-i18next';
import type { FOOTER_NAV, PRIMARY_NAV } from '../components/layout/nav-items';
import { PlaceholderPage } from './PlaceholderPage';

export type PlannedSectionKey =
  (typeof PRIMARY_NAV)[number]['labelKey'] | (typeof FOOTER_NAV)[number]['labelKey'];

export function PlannedSectionPage({ labelKey }: { labelKey: PlannedSectionKey }) {
  const { t } = useTranslation();
  return <PlaceholderPage section={t(labelKey)} />;
}
