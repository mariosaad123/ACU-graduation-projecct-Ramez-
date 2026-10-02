import type { LearningLanguage } from '@acu/shared';
import clsx from 'clsx';
import { LANGUAGE_GLYPHS } from '../brand/aperture';
import styles from './LanguageGlyph.module.css';

interface LanguageGlyphProps {
  language: LearningLanguage;
  size?: 'sm' | 'md' | 'lg';
  /** Marks the language being studied now, in the emblem orange. */
  active?: boolean;
  className?: string;
}

/** The language's letter in a square tile. Decorative: the name is always written next to it. */
export function LanguageGlyph({
  language,
  size = 'md',
  active = false,
  className,
}: LanguageGlyphProps) {
  return (
    <span
      className={clsx(styles.glyph, styles[size], className)}
      data-active={active}
      lang={language}
      aria-hidden="true"
    >
      {LANGUAGE_GLYPHS[language]}
    </span>
  );
}
