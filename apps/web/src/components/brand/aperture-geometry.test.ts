import { describe, expect, it } from 'vitest';
import { createAperture } from './aperture-geometry';

const radius = 50;

function numbersIn(path: string): number[] {
  return [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(([value]) => Number(value));
}

describe('createAperture', () => {
  it('creates one closed blade per requested blade', () => {
    const blades = createAperture({ blades: 6, outerRadius: radius, opening: 0.3 });

    expect(blades).toHaveLength(6);
    for (const blade of blades) {
      expect(blade.path).toMatch(/^M .+ L .+ A .+ Z$/);
    }
  });

  it('places the outer corners of every blade on the outer circle', () => {
    const [blade] = createAperture({ blades: 6, outerRadius: radius, opening: 0.3 });
    const values = numbersIn(blade?.path ?? '');
    const lineEnd = { x: values[2] ?? 0, y: values[3] ?? 0 };
    const arcEnd = { x: values[9] ?? 0, y: values[10] ?? 0 };

    expect(Math.hypot(lineEnd.x, lineEnd.y)).toBeCloseTo(radius, 2);
    expect(Math.hypot(arcEnd.x, arcEnd.y)).toBeCloseTo(radius, 2);
  });

  it('keeps every label anchor between the opening and the rim', () => {
    const blades = createAperture({ blades: 6, outerRadius: radius, opening: 0.3 });

    for (const { anchor } of blades) {
      const distance = Math.hypot(anchor.x, anchor.y);
      expect(distance).toBeGreaterThan(radius * 0.3);
      expect(distance).toBeLessThan(radius);
    }
  });

  it('rejects impossible shapes', () => {
    expect(() => createAperture({ blades: 2, outerRadius: radius, opening: 0.3 })).toThrow();
    expect(() => createAperture({ blades: 6, outerRadius: radius, opening: 1 })).toThrow();
  });
});
