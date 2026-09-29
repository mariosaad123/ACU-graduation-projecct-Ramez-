const PLACEHOLDER_ORIGIN = 'http://return-to.invalid';
const MAX_LENGTH = 512;

/**
 * Accepts only a path on our own site (e.g. "/app?tab=1"). Anything that could leave the site,
 * such as "//evil.com", "/\\evil.com" or "https://evil.com", becomes null: this prevents the
 * sign-in flow from being used as an open redirect.
 */
export function sanitizeReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_LENGTH) {
    return null;
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }

  try {
    const url = new URL(value, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
