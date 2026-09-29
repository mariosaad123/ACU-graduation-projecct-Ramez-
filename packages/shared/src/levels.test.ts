import { describe, expect, it } from 'vitest';
import { compareCefrLevels, isCefrLevel } from './levels';

describe('CEFR levels', () => {
  it('orders levels from A1 to C2', () => {
    expect(compareCefrLevels('A1', 'C2')).toBeLessThan(0);
    expect(compareCefrLevels('B2', 'B1')).toBeGreaterThan(0);
    expect(compareCefrLevels('C1', 'C1')).toBe(0);
  });

  it('rejects values outside the framework', () => {
    expect(isCefrLevel('B1')).toBe(true);
    expect(isCefrLevel('b1')).toBe(false);
    expect(isCefrLevel('D1')).toBe(false);
  });
});
