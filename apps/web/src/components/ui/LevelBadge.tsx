import { CEFR_LEVELS, type CefrLevel } from '@acu/shared';
import clsx from 'clsx';
import styles from './LevelBadge.module.css';

interface LevelBadgeProps {
  level: CefrLevel;
  /** Accessible name, e.g. "Level B1". The visible text is the level code alone. */
  label: string;
  className?: string;
}

/** Shows a CEFR level together with its position on the six-step ladder. */
export function LevelBadge({ level, label, className }: LevelBadgeProps) {
  const reached = CEFR_LEVELS.indexOf(level);

  return (
    <span className={clsx(styles.levelBadge, className)} role="img" aria-label={label}>
      <span className={styles.code} dir="ltr">
        {level}
      </span>
      <span className={styles.ladder} aria-hidden="true">
        {CEFR_LEVELS.map((step, index) => (
          <span key={step} className={styles.step} data-reached={index <= reached} />
        ))}
      </span>
    </span>
  );
}
