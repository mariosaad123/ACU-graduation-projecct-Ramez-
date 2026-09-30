import { LANGUAGES, type LearningLanguage } from '@acu/shared';
import { CheckIcon } from '@phosphor-icons/react';
import clsx from 'clsx';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguageName } from '../../i18n/use-language-name';
import {
  APERTURE_BLADES,
  APERTURE_LANGUAGES,
  APERTURE_VIEWBOX,
  LANGUAGE_GLYPHS,
} from '../brand/aperture';
import styles from './LanguagePicker.module.css';

interface CommonProps {
  name?: string;
  /** Replaces the default "Choose a language to learn". */
  legend?: string;
  /** Shown but not selectable, e.g. languages the student already learns. */
  unavailable?: readonly LearningLanguage[];
  /** Says why a language is unavailable, under its name. */
  unavailableNote?: string;
  error?: string;
  className?: string;
}

interface SingleProps extends CommonProps {
  multiple?: false;
  value: LearningLanguage | null;
  onChange: (language: LearningLanguage) => void;
}

interface MultipleProps extends CommonProps {
  multiple: true;
  /** In the order the person picked them. */
  value: readonly LearningLanguage[];
  onChange: (languages: LearningLanguage[]) => void;
}

export type LanguagePickerProps = SingleProps | MultipleProps;

/**
 * Six-blade aperture, one blade per language. Keyboard and screen reader support comes from the
 * native radio group (or checkboxes, for several languages) next to it; the aperture is a pointer
 * shortcut that mirrors its state.
 */
export function LanguagePicker(props: LanguagePickerProps) {
  const {
    name = 'learning-language',
    legend,
    unavailable = [],
    unavailableNote,
    error,
    className,
  } = props;
  const { t } = useTranslation();
  const languageName = useLanguageName();
  const id = useId();
  const errorId = `${id}-error`;
  const [highlighted, setHighlighted] = useState<LearningLanguage | null>(null);

  const isSelected = (language: LearningLanguage) =>
    props.multiple ? props.value.includes(language) : props.value === language;
  const isUnavailable = (language: LearningLanguage) => unavailable.includes(language);

  const choose = (language: LearningLanguage) => {
    if (isUnavailable(language)) {
      return;
    }
    if (!props.multiple) {
      props.onChange(language);
      return;
    }
    props.onChange(
      props.value.includes(language)
        ? props.value.filter((selected) => selected !== language)
        : [...props.value, language],
    );
  };

  const highlight = (language: LearningLanguage | null) => {
    setHighlighted(language && !isUnavailable(language) ? language : null);
  };

  return (
    <fieldset
      className={clsx(styles.picker, className)}
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className={styles.legend}>{legend ?? t('languagePicker.label')}</legend>
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}

      <div className={styles.body}>
        <svg
          className={styles.aperture}
          viewBox={APERTURE_VIEWBOX}
          aria-hidden="true"
          focusable="false"
        >
          {APERTURE_BLADES.map((blade, index) => {
            const language = APERTURE_LANGUAGES[index];
            if (!language) {
              return null;
            }
            return (
              <g
                key={language}
                className={styles.blade}
                data-selected={isSelected(language)}
                data-highlighted={language === highlighted}
                data-unavailable={isUnavailable(language)}
                onClick={() => {
                  choose(language);
                }}
                onPointerEnter={() => {
                  highlight(language);
                }}
                onPointerLeave={() => {
                  highlight(null);
                }}
              >
                <path d={blade.path} className={styles.bladeShape} />
                <text
                  x={blade.anchor.x}
                  y={blade.anchor.y}
                  className={styles.glyph}
                  lang={language}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {LANGUAGE_GLYPHS[language]}
                </text>
              </g>
            );
          })}
        </svg>

        <ul className={styles.options}>
          {APERTURE_LANGUAGES.map((language) => {
            const optionId = `${id}-${language}`;
            const disabled = isUnavailable(language);
            return (
              <li
                key={language}
                className={styles.option}
                data-highlighted={language === highlighted}
                onPointerEnter={() => {
                  highlight(language);
                }}
                onPointerLeave={() => {
                  highlight(null);
                }}
              >
                <input
                  id={optionId}
                  type={props.multiple ? 'checkbox' : 'radio'}
                  name={name}
                  value={language}
                  checked={isSelected(language)}
                  disabled={disabled}
                  className="visually-hidden"
                  onChange={() => {
                    choose(language);
                  }}
                  onFocus={() => {
                    highlight(language);
                  }}
                  onBlur={() => {
                    highlight(null);
                  }}
                />
                <label htmlFor={optionId} className={styles.optionLabel}>
                  <span className={styles.optionGlyph} lang={language} aria-hidden="true">
                    {LANGUAGE_GLYPHS[language]}
                  </span>
                  <span className={styles.optionText}>
                    <span lang={language} dir={LANGUAGES[language].direction}>
                      {LANGUAGES[language].nativeName}
                    </span>
                    <span className={styles.optionTranslation}>
                      {disabled && unavailableNote
                        ? `${languageName(language)} · ${unavailableNote}`
                        : languageName(language)}
                    </span>
                  </span>
                  {props.multiple && (
                    <CheckIcon className={styles.check} weight="bold" aria-hidden="true" />
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </fieldset>
  );
}
