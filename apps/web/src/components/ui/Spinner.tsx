import { useTranslation } from 'react-i18next';
import { ApertureMark } from '../brand/ApertureMark';
import { Emblem } from '../brand/Emblem';

interface SpinnerProps {
  size?: string;
  /**
   * `brand` spins the faculty emblem. `current` is a single-colour aperture that follows the
   * text colour, for places such as buttons where the full-colour emblem would clash.
   */
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
      {tone === 'brand' ? (
        <Emblem size={size} spinning />
      ) : (
        <ApertureMark size={size} tone="current" gapColor="transparent" spinning />
      )}
      {announcement && <span className="visually-hidden">{announcement}</span>}
    </span>
  );
}
