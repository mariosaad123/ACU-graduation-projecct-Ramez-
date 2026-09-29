import { describe, expect, it } from 'vitest';
import { doctorOnboardingSchema, emailCodeSchema, studentOnboardingSchema } from './auth';

const validDoctor = {
  accessCode: 'faculty-code',
  staffId: 'ACU-1042',
  displayName: 'Dr. Mona Adel',
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
  it('accepts a supported language and goal only', () => {
    expect(
      studentOnboardingSchema.safeParse({ learningLanguage: 'ja', goal: 'travel' }).success,
    ).toBe(true);
    expect(
      studentOnboardingSchema.safeParse({ learningLanguage: 'es', goal: 'travel' }).success,
    ).toBe(false);
    expect(studentOnboardingSchema.safeParse({ learningLanguage: 'ja', goal: 'fun' }).success).toBe(
      false,
    );
  });
});

describe('emailCodeSchema', () => {
  it('accepts exactly six digits', () => {
    expect(emailCodeSchema.safeParse({ code: ' 042917 ' }).data).toEqual({ code: '042917' });
    expect(emailCodeSchema.safeParse({ code: '42917' }).success).toBe(false);
    expect(emailCodeSchema.safeParse({ code: '04291a' }).success).toBe(false);
  });
});
