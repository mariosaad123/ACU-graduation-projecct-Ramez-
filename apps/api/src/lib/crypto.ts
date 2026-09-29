import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** 256 bits of randomness, URL-safe. Used for session tokens. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A numeric one-time code, uniformly distributed (leading zeros kept). */
export function randomNumericCode(length: number): string {
  return Array.from({ length }, () => randomInt(0, 10)).join('');
}

/** Argon2id with the library defaults (OWASP-recommended memory and time costs). */
export function hashSecret(secret: string): Promise<string> {
  return hash(secret);
}

export function verifySecret(storedHash: string, secret: string): Promise<boolean> {
  return verify(storedHash, secret).catch(() => false);
}
