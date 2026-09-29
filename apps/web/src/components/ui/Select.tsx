import { CaretDownIcon } from '@phosphor-icons/react';
import clsx from 'clsx';
import type { ComponentPropsWithRef } from 'react';
import { Field, type FieldProps } from './Field';
import styles from './Field.module.css';
import selectStyles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  lang?: string;
}

type SelectProps = Omit<FieldProps, 'children'> &
  Omit<ComponentPropsWithRef<'select'>, 'id' | 'className' | 'children'> & {
    options: readonly SelectOption[];
    placeholder?: string;
  };

/** A styled native select: keyboard, screen reader and mobile picker support come for free. */
export function Select({
  label,
  hint,
  error,
  optional,
  className,
  options,
  placeholder,
  ...selectProps
}: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className}>
      {(control) => (
        <div className={selectStyles.wrapper}>
          <select
            className={clsx(styles.control, selectStyles.select)}
            required={!optional}
            {...control}
            {...selectProps}
          >
            {placeholder !== undefined && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value} lang={option.lang}>
                {option.label}
              </option>
            ))}
          </select>
          <CaretDownIcon className={selectStyles.caret} aria-hidden="true" />
        </div>
      )}
    </Field>
  );
}
