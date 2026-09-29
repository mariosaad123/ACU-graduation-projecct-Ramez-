import clsx from 'clsx';
import type { CSSProperties } from 'react';
import emblemUrl from '../../assets/brand/emblem.webp';
import styles from './Emblem.module.css';

interface EmblemProps {
  size?: string;
  /** Continuous shutter motion, used as the loading indicator. */
  spinning?: boolean;
  /** Turns by one blade when the surrounding link is hovered or focused. */
  turnOnHover?: boolean;
  /** Accessible name. Leave empty when nearby text already names the brand. */
  label?: string;
  className?: string;
}

/**
 * The faculty emblem, drawn as two stacked copies of one image: the outer ring of blades
 * (which can rotate like a camera aperture) and the globe in the middle (which stays still).
 */
export function Emblem({
  size = '2rem',
  spinning = false,
  turnOnHover = false,
  label,
  className,
}: EmblemProps) {
  return (
    <span
      className={clsx(
        styles.emblem,
        spinning && styles.spinning,
        turnOnHover && styles.turnOnHover,
        className,
      )}
      style={{ '--emblem-size': size } as CSSProperties}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <img className={clsx(styles.layer, styles.globe)} src={emblemUrl} alt="" decoding="async" />
      <img className={clsx(styles.layer, styles.ring)} src={emblemUrl} alt="" decoding="async" />
    </span>
  );
}
