import clsx from 'clsx';
import type { ComponentPropsWithRef } from 'react';
import { Field, type FieldProps } from './Field';
import styles from './Field.module.css';

type TextFieldProps = Omit<FieldProps, 'children'> &
  Omit<ComponentPropsWithRef<'input'>, 'id' | 'className'> & {
    inputClassName?: string;
  };

export function TextField({
  label,
  hint,
  error,
  optional,
  className,
  inputClassName,
  ...inputProps
}: TextFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className}>
      {(control) => (
        <input
          className={clsx(styles.control, inputClassName)}
          required={!optional}
          {...control}
          {...inputProps}
        />
      )}
    </Field>
  );
}
