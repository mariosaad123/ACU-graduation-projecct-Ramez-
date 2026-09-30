import { useMemo } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { WCAG_AA, contrastRatio } from '../../../lib/contrast';
import { DsGroup, DsSection } from '../DsSection';
import type { DesignSystemCopy } from '../use-copy';
import styles from '../DesignSystemPage.module.css';

const PALETTES = [
  { name: 'gray', steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { name: 'blue', steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { name: 'orange', steps: [50, 100, 300, 500, 800] },
  { name: 'gold', steps: [50, 100, 500, 700] },
  { name: 'teal', steps: [50, 100, 500, 700] },
  { name: 'coral', steps: [50, 100, 500, 700] },
  { name: 'sky', steps: [50, 100, 500, 700] },
  { name: 'ochre', steps: [50, 100, 500, 700] },
] as const;

const PAIRS = [
  ['--color-text', '--color-bg'],
  ['--color-text-secondary', '--color-bg'],
  ['--color-text-muted', '--color-bg'],
  ['--color-text-on-action', '--color-action'],
  ['--color-action', '--color-action-subtle'],
  ['--color-success', '--color-success-bg'],
  ['--color-warning', '--color-warning-bg'],
  ['--color-danger', '--color-danger-bg'],
  ['--color-achievement', '--color-achievement-bg'],
  ['--color-listening', '--color-listening-bg'],
  ['--color-speaking', '--color-speaking-bg'],
  ['--color-reading', '--color-reading-bg'],
  ['--color-writing', '--color-writing-bg'],
] as const;

function readToken(styles: CSSStyleDeclaration, token: string): string {
  return styles.getPropertyValue(token).trim();
}

export function ColorSection({ copy }: { copy: DesignSystemCopy }) {
  const pairs = useMemo(() => {
    const computed = getComputedStyle(document.documentElement);
    return PAIRS.map(([foreground, background]) => {
      const ratio = contrastRatio(readToken(computed, foreground), readToken(computed, background));
      return { foreground, background, ratio };
    });
  }, []);

  return (
    <DsSection id="colors" title={copy.sections.colors} description={copy.colors.body}>
      <DsGroup title={copy.colors.primitives}>
        <div className={styles.palettes}>
          {PALETTES.map((palette) => (
            <div key={palette.name} className={styles.palette}>
              <span className={styles.paletteName} dir="ltr">
                {palette.name}
              </span>
              <div className={styles.swatches}>
                {palette.steps.map((step) => (
                  <span
                    key={step}
                    className={styles.swatch}
                    data-dark={step >= 500}
                    style={{ background: `var(--${palette.name}-${step})` }}
                    title={`--${palette.name}-${step}`}
                  >
                    <span dir="ltr">{step}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DsGroup>

      <DsGroup title={copy.colors.pairs}>
        <ul className={styles.pairs}>
          {pairs.map(({ foreground, background, ratio }) => (
            <li
              key={`${foreground}-${background}`}
              className={styles.pair}
              style={{ color: `var(${foreground})`, background: `var(${background})` }}
            >
              <span className={styles.pairSample}>Aa أب</span>
              <code className={styles.pairTokens} dir="ltr">
                {foreground}
                <br />
                {background}
              </code>
              <Badge tone={ratio >= WCAG_AA.text ? 'success' : 'danger'}>
                <span dir="ltr">{ratio.toFixed(2)}</span>
                {ratio >= WCAG_AA.text ? copy.colors.pass : copy.colors.fail}
              </Badge>
            </li>
          ))}
        </ul>
      </DsGroup>
    </DsSection>
  );
}
