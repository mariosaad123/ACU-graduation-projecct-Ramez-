import { describe, expect, it } from 'vitest';
import {
  doctorOnboardingSchema,
  emailCodeSchema,
  studentLanguageRequestSchema,
  studentOnboardingSchema,
} from './auth';

const validDoctor = {
  accessCode: 'faculty-code',
  staffId: 'ACU-1042',
  displayName: 'Dr. Mona Adel',
  languages: ['fr'],
  universityEmail: 'mona.adel@acu.edu.eg',
};

describe('doctorOnboardingSchema', () => {
  it('accepts a complete request and normalises the email', () => {
    const result = doctorOnboardingSchema.safeParse({
      ...validDoctor,
      universityEmail: '  Mona.Adel@ACU.edu.eg ',
      displayName: '  Dr. Mona Adel  ',
    });

    expect(result.success).toBe(true);
    expect(result.data?.universityEmail).toBe('mona.adel@acu.edu.eg');
    expect(result.data?.displayName).toBe('Dr. Mona Adel');
  });

  it.each(['mona@gmail.com', 'mona@acu.edu.eg.evil.com', 'mona@fakeacu.edu.eg', 'not-an-email'])(
    'rejects %s as a university email',
    (universityEmail) => {
      expect(doctorOnboardingSchema.safeParse({ ...validDoctor, universityEmail }).success).toBe(
        false,
      );
    },
  );

  it('requires at least one language taught, each once', () => {
    expect(doctorOnboardingSchema.safeParse({ ...validDoctor, languages: [] }).success).toBe(false);
    expect(
      doctorOnboardingSchema.safeParse({ ...validDoctor, languages: ['fr', 'fr'] }).success,
    ).toBe(false);
    expect(
      doctorOnboardingSchema.safeParse({ ...validDoctor, languages: ['fr', 'en'] }).success,
    ).toBe(true);
  });

  it('requires the access code', () => {
    expect(doctorOnboardingSchema.safeParse({ ...validDoctor, accessCode: '   ' }).success).toBe(
      false,
    );
  });

  it.each(['12', 'ACU 1042', 'ACU_1042', 'x'.repeat(21)])('rejects staff ID %s', (staffId) => {
    expect(doctorOnboardingSchema.safeParse({ ...validDoctor, staffId }).success).toBe(false);
  });
});

describe('studentOnboardingSchema', () => {
  const validStudent = {
    languages: ['ja'],
    activeLanguage: 'ja',
    goal: 'travel',
    universityId: '20231234',
  };

  it('accepts one language', () => {
    expect(studentOnboardingSchema.safeParse(validStudent).success).toBe(true);
  });

  it('accepts all six languages, starting with any of them', () => {
    const result = studentOnboardingSchema.safeParse({
      languages: ['en', 'fr', 'de', 'zh', 'ja', 'ar'],
      activeLanguage: 'zh',
      goal: 'study',
      universityId: ' 2023-a17 ',
    });
    expect(result.success).toBe(true);
    // Kept as the card prints it.
    expect(result.data?.universityId).toBe('2023-A17');
  });

  it.each([
    ['no language', { languages: [] }],
    ['an unsupported language', { languages: ['ja', 'it'] }],
    ['the same language twice', { languages: ['ja', 'ja'] }],
    ['an unsupported goal', { goal: 'fun' }],
    ['no university number', { universityId: '' }],
    ['a university number with spaces inside', { universityId: '2023 1234' }],
  ])('rejects %s', (_label, change) => {
    expect(studentOnboardingSchema.safeParse({ ...validStudent, ...change }).success).toBe(false);
  });

  it('requires the starting language to be one of the chosen ones', () => {
    const result = studentOnboardingSchema.safeParse({ ...validStudent, activeLanguage: 'fr' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['activeLanguage']);
  });
});

describe('studentLanguageRequestSchema', () => {
  it('accepts a supported language only', () => {
    expect(studentLanguageRequestSchema.safeParse({ language: 'de' }).success).toBe(true);
    expect(studentLanguageRequestSchema.safeParse({ language: 'it' }).success).toBe(false);
    expect(studentLanguageRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('emailCodeSchema', () => {
  it('accepts exactly six digits', () => {
    expect(emailCodeSchema.safeParse({ code: ' 042917 ' }).data).toEqual({ code: '042917' });
    expect(emailCodeSchema.safeParse({ code: '42917' }).success).toBe(false);
    expect(emailCodeSchema.safeParse({ code: '04291a' }).success).toBe(false);
  });
});
