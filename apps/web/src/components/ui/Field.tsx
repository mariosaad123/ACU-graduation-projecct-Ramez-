import { WarningCircleIcon } from '@phosphor-icons/react';
import clsx from 'clsx';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Field.module.css';

export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  /** Fields are required by default; optional ones are labelled, not the other way round. */
  optional?: boolean;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

export function Field({ label, hint, error, optional = false, className, children }: FieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={clsx(styles.field, error && styles.invalid, className)}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {optional && (
          <>
            {' '}
            <span className={styles.optional}>({t('common.optional')})</span>
          </>
        )}
      </label>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          <WarningCircleIcon weight="fill" aria-hidden="true" />
          {error}
        </p>
      )}
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
    </div>
  );
}
