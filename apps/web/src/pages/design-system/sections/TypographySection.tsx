import { DsSection } from '../DsSection';
import { DESIGN_SYSTEM_COPY } from '../copy';
import type { DesignSystemCopy } from '../use-copy';
import styles from '../DesignSystemPage.module.css';

const SCALE = ['5xl', '4xl', '3xl', '2xl', 'xl', 'lg', 'md', 'sm', 'xs'] as const;

const SCRIPT_SAMPLES = [
  { lang: 'ar', dir: 'rtl', text: 'اللغة مفتاح لفهم العالم' },
  { lang: 'en', dir: 'ltr', text: 'Language opens the world' },
  { lang: 'fr', dir: 'ltr', text: 'La langue ouvre le monde' },
  { lang: 'de', dir: 'ltr', text: 'Sprache öffnet die Welt' },
  { lang: 'zh', dir: 'ltr', text: '语言打开世界的大门' },
  { lang: 'ja', dir: 'ltr', text: '言葉は世界への扉です' },
] as const;

export function TypographySection({ copy }: { copy: DesignSystemCopy }) {
  return (
    <DsSection id="typography" title={copy.sections.typography} description={copy.typography.body}>
      <div className={styles.typeGrid}>
        {(['ar', 'en'] as const).map((locale) => {
          const sample = DESIGN_SYSTEM_COPY[locale].typography;
          return (
            <div
              key={locale}
              className={styles.typeColumn}
              lang={locale}
              dir={locale === 'ar' ? 'rtl' : 'ltr'}
            >
              <p className={styles.display}>{sample.display}</p>
              <p className={styles.headingSample}>{sample.heading}</p>
              <p>{sample.paragraph}</p>
            </div>
          );
        })}
      </div>

      <ul className={styles.scale}>
        {SCALE.map((size) => (
          <li key={size} className={styles.scaleRow}>
            <code dir="ltr">--text-{size}</code>
            <span style={{ fontSize: `var(--text-${size})` }}>{copy.typography.display}</span>
          </li>
        ))}
      </ul>

      <ul className={styles.scripts}>
        {SCRIPT_SAMPLES.map((sample) => (
          <li key={sample.lang} lang={sample.lang} dir={sample.dir} className={styles.scriptSample}>
            {sample.text}
          </li>
        ))}
      </ul>
    </DsSection>
  );
}
