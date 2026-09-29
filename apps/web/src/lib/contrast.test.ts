import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHexColor } from './contrast';

describe('parseHexColor', () => {
  it('reads long and short hex forms', () => {
    expect(parseHexColor('#174593')).toEqual([23, 69, 147]);
    expect(parseHexColor('#fff')).toEqual([255, 255, 255]);
  });

  it('rejects anything that is not a hex colour', () => {
    expect(() => parseHexColor('blue')).toThrow();
    expect(() => parseHexColor('#12345')).toThrow();
  });
});

describe('contrastRatio', () => {
  it('matches the reference values from the WCAG specification', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#fff')).toBeCloseTo(4.54, 2);
  });

  it('does not depend on argument order', () => {
    expect(contrastRatio('#174593', '#eef3fb')).toBe(contrastRatio('#eef3fb', '#174593'));
  });
});
