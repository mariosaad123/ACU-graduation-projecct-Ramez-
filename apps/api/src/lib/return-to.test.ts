import { describe, expect, it } from 'vitest';
import { sanitizeReturnTo } from './return-to';

describe('sanitizeReturnTo', () => {
  it.each(['/app', '/app?tab=groups', '/library/books/12#chapter-3', '/'])(
    'keeps the internal path %s',
    (path) => {
      expect(sanitizeReturnTo(path)).toBe(path);
    },
  );

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'app',
    '/app\nSet-Cookie: x=1',
    `/${'a'.repeat(600)}`,
    '',
    undefined,
    ['/app'],
  ])('rejects %j', (value) => {
    expect(sanitizeReturnTo(value)).toBeNull();
  });
});
