import { LANGUAGES, type LearningLanguage } from '@acu/shared';
import { useState } from 'react';
import { ApertureMark } from '../../../components/brand/ApertureMark';
import { LanguagePicker } from '../../../components/language/LanguagePicker';
import { Spinner } from '../../../components/ui/Spinner';
import { DsSection } from '../DsSection';
import type { DesignSystemCopy } from '../use-copy';
import styles from '../DesignSystemPage.module.css';

export function BrandSection({ copy }: { copy: DesignSystemCopy }) {
  const [language, setLanguage] = useState<LearningLanguage>('ar');

  return (
    <DsSection id="brand" title={copy.sections.brand} description={copy.brand.body}>
      <div className={styles.row}>
        <ApertureMark size="6rem" />
        <ApertureMark size="3rem" />
        <ApertureMark size="1.5rem" />
        <span className={styles.inverse}>
          <ApertureMark size="3rem" tone="current" gapColor="var(--gray-900)" />
        </span>
        <Spinner size="2.5rem" />
      </div>
      <LanguagePicker value={language} onChange={setLanguage} name="ds-language" />
      <p className={styles.note}>
        {copy.brand.selected}: <strong lang={language}>{LANGUAGES[language].nativeName}</strong>
      </p>
    </DsSection>
  );
}
