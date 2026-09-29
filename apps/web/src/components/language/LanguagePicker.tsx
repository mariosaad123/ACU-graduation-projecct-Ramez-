import { LANGUAGES, type LearningLanguage } from '@acu/shared';
import clsx from 'clsx';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../i18n/use-locale';
import {
  APERTURE_BLADES,
  APERTURE_LANGUAGES,
  APERTURE_VIEWBOX,
  LANGUAGE_GLYPHS,
} from '../brand/aperture';
import styles from './LanguagePicker.module.css';

interface LanguagePickerProps {
  value: LearningLanguage;
  onChange: (language: LearningLanguage) => void;
  name?: string;
  className?: string;
}

/**
 * Six-blade aperture, one blade per language. Keyboard and screen reader support comes from the
 * native radio group next to it; the aperture is a pointer shortcut that mirrors its state.
 */
export function LanguagePicker({
  value,
  onChange,
  name = 'learning-language',
  className,
}: LanguagePickerProps) {
  const { t } = useTranslation();
  const { intlLocale } = useLocale();
  const id = useId();
  const [highlighted, setHighlighted] = useState<LearningLanguage | null>(null);

  const displayNames = useMemo(
    () => new Intl.DisplayNames([intlLocale], { type: 'language' }),
    [intlLocale],
  );

  return (
    <fieldset className={clsx(styles.picker, className)}>
      <legend className={styles.legend}>{t('languagePicker.label')}</legend>

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
                data-selected={language === value}
                data-highlighted={language === highlighted}
                onClick={() => {
                  onChange(language);
                }}
                onPointerEnter={() => {
                  setHighlighted(language);
                }}
                onPointerLeave={() => {
                  setHighlighted(null);
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
            return (
              <li
                key={language}
                className={styles.option}
                data-highlighted={language === highlighted}
                onPointerEnter={() => {
                  setHighlighted(language);
                }}
                onPointerLeave={() => {
                  setHighlighted(null);
                }}
              >
                <input
                  id={optionId}
                  type="radio"
                  name={name}
                  value={language}
                  checked={language === value}
                  className="visually-hidden"
                  onChange={() => {
                    onChange(language);
                  }}
                  onFocus={() => {
                    setHighlighted(language);
                  }}
                  onBlur={() => {
                    setHighlighted(null);
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
                    <span className={styles.optionTranslation}>{displayNames.of(language)}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </fieldset>
  );
}
