interface DriverError {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
}

/**
 * Returns the constraint name when an error is a PostgreSQL unique violation (SQLSTATE 23505).
 * Drizzle wraps driver errors, so the original is looked for in the `cause` chain.
 */
export function uniqueViolation(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const candidate = current as DriverError;
    if (candidate.code === '23505') {
      return typeof candidate.constraint === 'string' ? candidate.constraint : '';
    }
    current = candidate.cause;
  }
  return null;
}

/** Returns the constraint name when an error is a PostgreSQL foreign key violation (23503). */
export function foreignKeyViolation(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const candidate = current as DriverError;
    if (candidate.code === '23503') {
      return typeof candidate.constraint === 'string' ? candidate.constraint : '';
    }
    current = candidate.cause;
  }
  return null;
}
