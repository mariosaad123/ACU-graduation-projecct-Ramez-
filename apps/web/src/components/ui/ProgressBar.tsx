import type { Skill } from '@acu/shared';
import clsx from 'clsx';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  label: string;
  value: number;
  max?: number;
  /** Text shown next to the label, e.g. "3 of 10". Defaults to a percentage. */
  valueText?: string;
  skill?: Skill;
  showLabel?: boolean;
  className?: string;
}

export function ProgressBar({
  label,
  value,
  max = 100,
  valueText,
  skill,
  showLabel = true,
  className,
}: ProgressBarProps) {
  const clamped = Math.min(Math.max(value, 0), max);
  const percentage = max === 0 ? 0 : Math.round((clamped / max) * 100);
  const text = valueText ?? `${percentage}%`;

  return (
    <div className={clsx(styles.progress, className)} data-skill={skill}>
      {showLabel && (
        <div className={styles.header} aria-hidden="true">
          <span>{label}</span>
          <span className={styles.value}>{text}</span>
        </div>
      )}
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={text}
      >
        <div className={styles.fill} style={{ inlineSize: `${percentage}%` }} />
      </div>
    </div>
  );
}
