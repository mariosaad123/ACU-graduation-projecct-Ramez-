import clsx from 'clsx';
import { useId, type ComponentPropsWithRef } from 'react';
import styles from './Choice.module.css';

interface CheckboxProps extends Omit<ComponentPropsWithRef<'input'>, 'type' | 'id'> {
  label: string;
  hint?: string;
}

export function Checkbox({ label, hint, className, ...inputProps }: CheckboxProps) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className={clsx(styles.choice, className)}>
      <input
        id={id}
        type="checkbox"
        className={clsx(styles.input, styles.checkbox)}
        aria-describedby={hint ? hintId : undefined}
        {...inputProps}
      />
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
