import { LANGUAGES, type LearningLanguage } from '@acu/shared';
import { useState } from 'react';
import { Emblem } from '../../../components/brand/Emblem';
import { LanguagePicker } from '../../../components/language/LanguagePicker';
import { Spinner } from '../../../components/ui/Spinner';
import { DsGroup, DsSection } from '../DsSection';
import type { DesignSystemCopy } from '../use-copy';
import styles from '../DesignSystemPage.module.css';

export function BrandSection({ copy }: { copy: DesignSystemCopy }) {
  const [language, setLanguage] = useState<LearningLanguage>('ar');

  return (
    <DsSection id="brand" title={copy.sections.brand} description={copy.brand.body}>
      <div className={styles.row}>
        <Emblem size="6rem" />
        <Emblem size="3rem" />
        <Emblem size="1.5rem" />
        <span className={styles.inverse}>
          <Emblem size="3rem" />
        </span>
      </div>

      <div className={styles.motionGrid}>
        <DsGroup title={copy.brand.loading}>
          <Spinner size="6rem" />
        </DsGroup>
        <DsGroup title={copy.brand.hover}>
          <a href="#brand" className={styles.hoverDemo}>
            <Emblem size="6rem" turnOnHover />
          </a>
        </DsGroup>
      </div>

      <LanguagePicker value={language} onChange={setLanguage} name="ds-language" />
      <p className={styles.note}>
        {copy.brand.selected}: <strong lang={language}>{LANGUAGES[language].nativeName}</strong>
      </p>
    </DsSection>
  );
}
