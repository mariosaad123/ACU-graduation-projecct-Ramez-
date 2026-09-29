export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export function isCefrLevel(value: string): value is CefrLevel {
  return (CEFR_LEVELS as readonly string[]).includes(value);
}

/** Negative when `a` is below `b`, zero when equal, positive when above. */
export function compareCefrLevels(a: CefrLevel, b: CefrLevel): number {
  return CEFR_LEVELS.indexOf(a) - CEFR_LEVELS.indexOf(b);
}
