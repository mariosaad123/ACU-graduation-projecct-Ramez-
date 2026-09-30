import { describe, expect, it } from 'vitest';
import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  formatJoinCode,
  groupCreateSchema,
  groupUpdateSchema,
  normalizeJoinCode,
  suspendStudentSchema,
} from './groups';

describe('join codes', () => {
  it('leaves out every symbol that is easy to misread', () => {
    expect(JOIN_CODE_ALPHABET).toHaveLength(30);
    for (const confusing of ['0', '1', 'I', 'L', 'O', 'U']) {
      expect(JOIN_CODE_ALPHABET).not.toContain(confusing);
    }
  });

  it('accepts what people type: any case, spaces and dashes', () => {
    expect(normalizeJoinCode('k7qm-9xrt')).toBe('K7QM9XRT');
    expect(normalizeJoinCode(' K7QM 9XRT ')).toBe('K7QM9XRT');
  });

  it.each(['K7QM9XR', 'K7QM9XRTT', 'K7QM9XR0', 'K7QM9XRI', 'K7QM9XR!', ''])(
    'rejects %s',
    (input) => {
      expect(normalizeJoinCode(input)).toBeNull();
    },
  );

  it('formats a code in two halves', () => {
    expect(formatJoinCode('K7QM9XRT')).toBe('K7QM-9XRT');
    expect('K7QM9XRT').toHaveLength(JOIN_CODE_LENGTH);
  });
});

describe('group requests', () => {
  it('trims the name and stores an empty description as none', () => {
    const result = groupCreateSchema.parse({
      name: '  Conversation 2  ',
      description: '   ',
      language: 'fr',
    });
    expect(result).toEqual({ name: 'Conversation 2', description: null, language: 'fr' });
  });

  it.each([
    ['a short name', { name: 'ab' }],
    ['a long name', { name: 'x'.repeat(81) }],
    ['a long description', { description: 'x'.repeat(301) }],
    ['an unsupported language', { language: 'es' }],
  ])('refuses %s', (_label, change) => {
    const request = { name: 'Conversation 2', language: 'fr', ...change };
    expect(groupCreateSchema.safeParse(request).success).toBe(false);
  });

  it('cannot change the language of a group', () => {
    expect(groupUpdateSchema.parse({ language: 'de', joinOpen: false })).toEqual({
      joinOpen: false,
    });
  });

  it('requires a reason to suspend an account', () => {
    expect(suspendStudentSchema.safeParse({ reason: '  ' }).success).toBe(false);
    expect(suspendStudentSchema.parse({ reason: ' Cheating in the midterm ' })).toEqual({
      reason: 'Cheating in the midterm',
    });
  });
});
