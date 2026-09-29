import clsx from 'clsx';
import { APERTURE_BLADES, APERTURE_VIEWBOX } from './aperture';
import styles from './ApertureMark.module.css';

interface ApertureMarkProps {
  size?: string;
  /** `brand` uses the brand blues; `current` follows the surrounding text colour. */
  tone?: 'brand' | 'current';
  /** Colour of the thin gaps between blades; should match the surface behind the mark. */
  gapColor?: string;
  spinning?: boolean;
  className?: string;
}

export function ApertureMark({
  size = '2rem',
  tone = 'brand',
  gapColor = 'var(--color-bg)',
  spinning = false,
  className,
}: ApertureMarkProps) {
  return (
    <svg
      className={clsx(styles.mark, styles[tone], spinning && styles.spinning, className)}
      viewBox={APERTURE_VIEWBOX}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      {APERTURE_BLADES.map((blade, index) => (
        <path
          key={blade.path}
          d={blade.path}
          className={styles.blade}
          data-emphasis={index % 2 === 0 ? 'strong' : 'soft'}
          stroke={gapColor}
        />
      ))}
    </svg>
  );
}
