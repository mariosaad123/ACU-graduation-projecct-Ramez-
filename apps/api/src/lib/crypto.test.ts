import { describe, expect, it } from 'vitest';
import {
  hashSecret,
  randomNumericCode,
  randomToken,
  safeEqual,
  sha256,
  verifySecret,
} from './crypto';

describe('crypto helpers', () => {
  it('creates long, unique, URL-safe tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, randomToken));

    expect(tokens.size).toBe(100);
    for (const token of tokens) {
      expect(token).toMatch(/^[\w-]{43}$/);
    }
  });

  it('hashes deterministically with SHA-256', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('compares strings without leaking length mismatches as exceptions', () => {
    expect(safeEqual('state-1', 'state-1')).toBe(true);
    expect(safeEqual('state-1', 'state-2')).toBe(false);
    expect(safeEqual('short', 'much longer')).toBe(false);
  });

  it('produces numeric codes of the requested length', () => {
    for (let index = 0; index < 50; index += 1) {
      expect(randomNumericCode(6)).toMatch(/^\d{6}$/);
    }
  });

  it('verifies Argon2 hashes and rejects wrong or malformed input', async () => {
    const stored = await hashSecret('faculty-code');

    expect(stored).toMatch(/^\$argon2id\$/);
    await expect(verifySecret(stored, 'faculty-code')).resolves.toBe(true);
    await expect(verifySecret(stored, 'Faculty-code')).resolves.toBe(false);
    await expect(verifySecret('not-a-hash', 'faculty-code')).resolves.toBe(false);
  });
});
