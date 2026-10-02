import { normalizeJoinCode } from '@acu/shared';

const KEY = 'acu.pendingJoinCode';

/** The address a student opens to join with a code. */
export function joinLink(code: string): string {
  return `${window.location.origin}/join/${code}`;
}

/**
 * A join link opened before signing in, or before choosing to be a student, is remembered for
 * this tab so the student lands on the join step afterwards instead of losing the code.
 */
export function rememberPendingJoinCode(code: string): void {
  try {
    sessionStorage.setItem(KEY, code);
  } catch {
    // Storage can be unavailable (private mode); the student can still type the code.
  }
}

export function peekPendingJoinCode(): string | null {
  try {
    const stored = sessionStorage.getItem(KEY);
    return stored ? normalizeJoinCode(stored) : null;
  } catch {
    return null;
  }
}

export function clearPendingJoinCode(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing was stored.
  }
}
