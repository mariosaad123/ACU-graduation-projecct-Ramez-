import { describe, expect, it } from 'vitest';
import { toAsciiDigits } from './digits';

describe('toAsciiDigits', () => {
  it.each([
    ['042917', '042917'],
    ['٠٤٢٩١٧', '042917'],
    ['۰۴۲۹۱۷', '042917'],
    ['04 29-17', '042917'],
    ['code: ٤٢', '42'],
    ['', ''],
  ])('turns %j into %j', (input, expected) => {
    expect(toAsciiDigits(input)).toBe(expected);
  });
});
