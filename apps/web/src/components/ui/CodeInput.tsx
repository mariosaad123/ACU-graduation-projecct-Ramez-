import clsx from 'clsx';
import { useId, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { toAsciiDigits } from '../../lib/digits';
import styles from './CodeInput.module.css';

interface CodeInputProps {
  label: string;
  length?: number;
  value: string;
  onChange: (value: string) => void;
  /** Called once every box is filled, e.g. to submit straight away. */
  onComplete?: (value: string) => void;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * One box per digit, laid out left to right in every language as codes are read that way.
 * Pasting a whole code fills every box, and the browser can fill it from an SMS or email.
 */
export function CodeInput({
  label,
  length = 6,
  value,
  onChange,
  onComplete,
  error,
  disabled = false,
  autoFocus = false,
}: CodeInputProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');

  const focusBox = (index: number) => {
    inputs.current[Math.max(0, Math.min(index, length - 1))]?.focus();
  };

  const update = (next: string) => {
    const clean = toAsciiDigits(next).slice(0, length);
    onChange(clean);
    if (clean.length === length) {
      onComplete?.(clean);
    }
  };

  const typeAt = (index: number, typed: string) => {
    const entered = toAsciiDigits(typed);
    if (!entered) {
      return;
    }
    const next = (value.slice(0, index) + entered).slice(0, length);
    update(next);
    focusBox(next.length);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (digits[index]) {
        update(value.slice(0, index) + value.slice(index + 1));
      } else if (index > 0) {
        update(value.slice(0, index - 1) + value.slice(index));
        focusBox(index - 1);
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusBox(index + 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = toAsciiDigits(event.clipboardData.getData('text')).slice(0, length);
    if (pasted) {
      update(pasted);
      focusBox(pasted.length);
    }
  };

  return (
    <div className={styles.field}>
      <p className={styles.label} id={`${id}-label`}>
        {label}
      </p>
      <div
        className={clsx(styles.boxes, error && styles.invalid)}
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={error ? errorId : undefined}
        dir="ltr"
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(node) => {
              inputs.current[index] = node;
            }}
            className={styles.box}
            value={digit}
            onChange={(event) => {
              typeAt(index, event.target.value.slice(-length));
            }}
            onKeyDown={(event) => {
              handleKeyDown(index, event);
            }}
            onPaste={handlePaste}
            onFocus={(event) => {
              event.target.select();
            }}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            aria-label={`${label} ${index + 1}/${length}`}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
          />
        ))}
      </div>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
