// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WCAG_AA, contrastRatio } from '../lib/contrast';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

const declarations = new Map(
  [...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name = '', value = '']) => [
    name,
    value.trim(),
  ]),
);

function resolveColor(token: string, seen = new Set<string>()): string {
  if (seen.has(token)) {
    throw new Error(`Circular reference while resolving ${token}`);
  }
  seen.add(token);

  const value = declarations.get(token);
  if (value === undefined) {
    throw new Error(`Token ${token} is not defined in tokens.css`);
  }

  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  return reference?.[1] ? resolveColor(reference[1], seen) : value;
}

type Pair = readonly [foreground: string, background: string];

const textPairs: Pair[] = [
  ['--color-text', '--color-bg'],
  ['--color-text-secondary', '--color-bg'],
  ['--color-text-muted', '--color-bg'],
  ['--color-text-muted', '--color-surface-muted'],
  ['--color-text-secondary', '--color-surface-sunken'],
  ['--color-link', '--color-bg'],
  ['--color-text-on-action', '--color-action'],
  ['--color-text-on-action', '--color-action-hover'],
  ['--color-text-on-action', '--color-danger-solid'],
  ['--color-action', '--color-action-subtle'],
  ['--color-action', '--color-action-subtle-hover'],
  ['--color-success', '--color-success-bg'],
  ['--color-warning', '--color-warning-bg'],
  ['--color-danger', '--color-danger-bg'],
  ['--color-info', '--color-info-bg'],
  ['--color-achievement', '--color-achievement-bg'],
  ...(['listening', 'speaking', 'reading', 'writing'] as const).flatMap((skill): Pair[] => [
    [`--color-${skill}`, `--color-${skill}-bg`],
    [`--color-${skill}`, '--color-bg'],
  ]),
];

const nonTextPairs: Pair[] = [
  ['--color-focus-ring', '--color-bg'],
  ['--color-border-input', '--color-bg'],
  ['--color-listening-accent', '--color-bg'],
  ['--color-speaking-accent', '--color-bg'],
  ['--color-reading-accent', '--color-bg'],
  ['--color-writing-accent', '--color-bg'],
  ['--color-achievement-accent', '--color-text'],
];

describe('design tokens', () => {
  it.each(textPairs)('%s on %s meets WCAG AA for text', (foreground, background) => {
    expect(
      contrastRatio(resolveColor(foreground), resolveColor(background)),
    ).toBeGreaterThanOrEqual(WCAG_AA.text);
  });

  it.each(nonTextPairs)('%s against %s meets WCAG AA for UI graphics', (foreground, background) => {
    expect(
      contrastRatio(resolveColor(foreground), resolveColor(background)),
    ).toBeGreaterThanOrEqual(WCAG_AA.nonText);
  });
});
