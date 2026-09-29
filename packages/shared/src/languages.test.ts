import { describe, expect, it } from 'vitest';
import { LANGUAGES, LEARNING_LANGUAGES, isInterfaceLocale, isLearningLanguage } from './languages';

describe('languages', () => {
  it('describes every learning language', () => {
    expect(Object.keys(LANGUAGES).sort()).toEqual([...LEARNING_LANGUAGES].sort());
  });

  it('marks Arabic as the only right-to-left language', () => {
    const rtl = Object.values(LANGUAGES).filter((language) => language.direction === 'rtl');
    expect(rtl.map((language) => language.code)).toEqual(['ar']);
  });

  it('recognises supported codes only', () => {
    expect(isLearningLanguage('ja')).toBe(true);
    expect(isLearningLanguage('es')).toBe(false);
    expect(isInterfaceLocale('ar')).toBe(true);
    expect(isInterfaceLocale('fr')).toBe(false);
  });
});
