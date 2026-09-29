import { Container } from '../../components/layout/Container';
import { PageTitle } from '../PageTitle';
import { BrandSection } from './sections/BrandSection';
import { ButtonSection } from './sections/ButtonSection';
import { ColorSection } from './sections/ColorSection';
import { DisplaySection } from './sections/DisplaySection';
import { FeedbackSection } from './sections/FeedbackSection';
import { FormSection } from './sections/FormSection';
import { MediaSection } from './sections/MediaSection';
import { NavigationSection } from './sections/NavigationSection';
import { TypographySection } from './sections/TypographySection';
import { useDesignSystemCopy } from './use-copy';
import styles from './DesignSystemPage.module.css';

const SECTION_IDS = [
  'brand',
  'colors',
  'typography',
  'buttons',
  'forms',
  'display',
  'feedback',
  'navigation',
  'media',
] as const;

export function DesignSystemPage() {
  const copy = useDesignSystemCopy();

  return (
    <>
      <PageTitle>{copy.title}</PageTitle>
      <Container className={styles.page}>
        <header className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{copy.title}</h1>
          <p className={styles.intro}>{copy.intro}</p>
        </header>

        <div className={styles.layout}>
          <nav className={styles.toc} aria-labelledby="ds-toc-title">
            <p id="ds-toc-title" className={styles.tocTitle}>
              {copy.onThisPage}
            </p>
            <ol className={styles.tocList}>
              {SECTION_IDS.map((id) => (
                <li key={id}>
                  <a href={`#${id}`} className={styles.tocLink}>
                    {copy.sections[id]}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className={styles.content}>
            <BrandSection copy={copy} />
            <ColorSection copy={copy} />
            <TypographySection copy={copy} />
            <ButtonSection copy={copy} />
            <FormSection copy={copy} />
            <DisplaySection copy={copy} />
            <FeedbackSection copy={copy} />
            <NavigationSection copy={copy} />
            <MediaSection copy={copy} />
          </div>
        </div>
      </Container>
    </>
  );
}
