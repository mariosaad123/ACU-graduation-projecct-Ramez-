import { LEARNING_LANGUAGES, type LearningLanguage } from '@acu/shared';
import { createAperture } from './aperture-geometry';

export const APERTURE_VIEWBOX = '-50 -50 100 100';

/** Blade order around the aperture, clockwise from the top. */
export const APERTURE_LANGUAGES: readonly LearningLanguage[] = LEARNING_LANGUAGES;

export const LANGUAGE_GLYPHS: Record<LearningLanguage, string> = {
  ar: 'ع',
  en: 'A',
  fr: 'É',
  de: 'Ä',
  es: 'Ñ',
  zh: '中',
  ja: 'あ',
};

export const APERTURE_BLADES = createAperture({
  blades: APERTURE_LANGUAGES.length,
  outerRadius: 48,
  opening: 0.36,
  rotation: 150,
});
