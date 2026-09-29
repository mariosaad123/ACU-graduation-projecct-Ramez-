import { useTranslation } from 'react-i18next';
import { ApertureMark } from '../brand/ApertureMark';

interface SpinnerProps {
  size?: string;
  tone?: 'brand' | 'current';
  /** Announced to screen readers. Omit when the spinner sits inside an element that already says it is busy. */
  label?: string | false;
  className?: string;
}

export function Spinner({ size = '1.5rem', tone = 'brand', label, className }: SpinnerProps) {
  const { t } = useTranslation();
  const announcement = label === false ? null : (label ?? t('common.loading'));

  return (
    <span role={announcement ? 'status' : undefined} className={className}>
      <ApertureMark size={size} tone={tone} gapColor="transparent" spinning />
      {announcement && <span className="visually-hidden">{announcement}</span>}
    </span>
  );
}
