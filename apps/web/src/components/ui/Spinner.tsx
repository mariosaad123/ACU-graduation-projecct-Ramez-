import { useTranslation } from 'react-i18next';
import { Emblem } from '../brand/Emblem';

interface SpinnerProps {
  size?: string;
  /** Announced to screen readers. Omit when the spinner sits inside an element that already says it is busy. */
  label?: string | false;
  className?: string;
}

/** The faculty emblem with its ring clicking round, used for every loading state. */
export function Spinner({ size = '1.5rem', label, className }: SpinnerProps) {
  const { t } = useTranslation();
  const announcement = label === false ? null : (label ?? t('common.loading'));

  return (
    <span role={announcement ? 'status' : undefined} className={className}>
      <Emblem size={size} spinning />
      {announcement && <span className="visually-hidden">{announcement}</span>}
    </span>
  );
}
