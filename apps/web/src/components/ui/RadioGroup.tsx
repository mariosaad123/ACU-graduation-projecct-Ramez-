import clsx from 'clsx';
import { useId } from 'react';
import styles from './Choice.module.css';

export interface RadioOption<Value extends string> {
  value: Value;
  label: string;
  hint?: string;
}

interface RadioGroupProps<Value extends string> {
  legend: string;
  name: string;
  options: readonly RadioOption<Value>[];
  value: Value | null;
  onChange: (value: Value) => void;
  error?: string;
  className?: string;
}

export function RadioGroup<Value extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  error,
  className,
}: RadioGroupProps<Value>) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <fieldset
      className={clsx(styles.group, className)}
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className={styles.legend}>{legend}</legend>
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
      {options.map((option) => {
        const optionId = `${id}-${option.value}`;
        return (
          <div key={option.value} className={styles.choice}>
            <input
              id={optionId}
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => {
                onChange(option.value);
              }}
              className={clsx(styles.input, styles.radio)}
              aria-describedby={option.hint ? `${optionId}-hint` : undefined}
            />
            <label htmlFor={optionId} className={styles.label}>
              {option.label}
            </label>
            {option.hint && (
              <p id={`${optionId}-hint`} className={styles.hint}>
                {option.hint}
              </p>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
