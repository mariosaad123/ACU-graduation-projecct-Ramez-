import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import emblemUrl from '../../assets/brand/emblem.webp';

/** One letter from each language the platform teaches, in the order they sit round the emblem. */
const LETTERS = [
  { letter: 'ع', lang: 'ar' },
  { letter: 'A', lang: 'en' },
  { letter: 'É', lang: 'fr' },
  { letter: 'Ä', lang: 'de' },
  { letter: 'Ñ', lang: 'es' },
  { letter: '中', lang: 'zh' },
  { letter: 'あ', lang: 'ja' },
] as const;

/**
 * The full-screen loading screen: the emblem turning in the middle with the platform's name under
 * it. It is the same screen index.html shows before any script has loaded, and its styles live
 * there, so the hand-over from one to the other cannot be seen.
 */
export function SplashScreen() {
  const { t } = useTranslation();

  return (
    <div className="splash" role="status" aria-label={t('common.loading')}>
      <div className="splash-mark">
        <div className="splash-orbit" aria-hidden="true">
          {LETTERS.map(({ letter, lang }, index) => (
            <span key={lang} lang={lang} style={{ '--i': index } as CSSProperties}>
              {letter}
            </span>
          ))}
        </div>
        <img className="splash-layer splash-globe" src={emblemUrl} alt="" />
        <img className="splash-layer splash-ring" src={emblemUrl} alt="" />
      </div>
      <div className="splash-text">
        <p className="splash-name">{t('brand.name')}</p>
        <span className="splash-bar" />
        <p className="splash-sub">
          {t('brand.faculty')} · {t('brand.university')}
        </p>
      </div>
    </div>
  );
}
