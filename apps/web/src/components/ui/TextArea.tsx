import clsx from 'clsx';
import type { ComponentPropsWithRef } from 'react';
import { Field, type FieldProps } from './Field';
import styles from './Field.module.css';
import textAreaStyles from './TextArea.module.css';

type TextAreaProps = Omit<FieldProps, 'children'> &
  Omit<ComponentPropsWithRef<'textarea'>, 'id' | 'className'>;

export function TextArea({
  label,
  hint,
  error,
  optional,
  className,
  ...textAreaProps
}: TextAreaProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className}>
      {(control) => (
        <textarea
          className={clsx(styles.control, textAreaStyles.textArea)}
          required={!optional}
          rows={5}
          {...control}
          {...textAreaProps}
        />
      )}
    </Field>
  );
}
