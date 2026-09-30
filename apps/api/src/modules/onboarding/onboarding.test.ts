import { doctorOnboardingResponseSchema, meResponseSchema } from '@acu/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents, doctorAccessCodes } from '../../db/schema';
import {
  DOCTOR_CODE,
  createTestContext,
  identity,
  post,
  setDoctorCode,
  signIn,
  type Agent,
  type TestContext,
} from '../../test/harness';
import {
  DOCTOR_CODE_FAILURE_LIMIT,
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_RESEND_COOLDOWN_MS,
  EMAIL_CODE_TTL_MS,
  maskEmail,
} from './onboarding.service';

let context: TestContext;
let staffCounter = 0;

beforeAll(async () => {
  context = await createTestContext();
  await setDoctorCode(context);
});

afterAll(async () => {
  await context.close();
});

beforeEach(() => {
  context.mailer.sent.length = 0;
});

function doctorRequest(overrides: Record<string, string> = {}) {
  staffCounter += 1;
  return {
    accessCode: DOCTOR_CODE,
    staffId: `ACU-${1000 + staffCounter}`,
    displayName: `Dr. Staff ${staffCounter}`,
    universityEmail: `staff${staffCounter}@acu.edu.eg`,
    ...overrides,
  };
}

async function me(agent: Agent) {
  return meResponseSchema.parse((await agent.get('/api/me').expect(200)).body).user;
}

async function revokeAllDoctorCodes() {
  await context.database.db.update(doctorAccessCodes).set({ revokedAt: new Date() });
}

function errorCode(response: { body: unknown }): string {
  return (response.body as { error: { code: string } }).error.code;
}

describe('student onboarding', () => {
  it('turns a new account into a student with a language and a goal', async () => {
    const { agent } = await signIn(context);

    const response = await post(agent, '/api/onboarding/student', {
      learningLanguage: 'fr',
      goal: 'travel',
    }).expect(200);

    const user = meResponseSchema.parse(response.body).user;
    expect(user.role).toBe('student');
    expect(user.student).toEqual({ learningLanguage: 'fr', goal: 'travel' });
    expect(user.doctor).toBeNull();
  });

  it('replaces the session when the role is granted', async () => {
    const { agent } = await signIn(context);
    const response = await post(agent, '/api/onboarding/student', {
      learningLanguage: 'en',
      goal: 'study',
    }).expect(200);

    expect(String(response.headers['set-cookie'])).toMatch(/acu_session=/);
    await agent.get('/api/me').expect(200);
  });

  it('validates the choices field by field', async () => {
    const { agent } = await signIn(context);
    const response = await post(agent, '/api/onboarding/student', {
      learningLanguage: 'es',
      goal: 'fun',
    }).expect(400);

    const body = response.body as { error: { code: string; fields: Record<string, string> } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(body.error.fields).sort()).toEqual(['goal', 'learningLanguage']);
  });

  it('cannot be repeated or used to change an existing role', async () => {
    const { agent } = await signIn(context);
    await post(agent, '/api/onboarding/student', { learningLanguage: 'de', goal: 'work' }).expect(
      200,
    );

    const again = await post(agent, '/api/onboarding/doctor', doctorRequest()).expect(409);
    expect(errorCode(again)).toBe('ALREADY_ONBOARDED');
  });

  it('requires a session', async () => {
    const { agent } = await signIn(context);
    await post(agent, '/api/auth/sign-out').expect(204);
    await post(agent, '/api/onboarding/student', { learningLanguage: 'de', goal: 'work' }).expect(
      401,
    );
  });
});

describe('doctor onboarding: access code', () => {
  it('refuses a wrong code, says so, and records the attempt', async () => {
    const { agent } = await signIn(context);
    const response = await post(
      agent,
      '/api/onboarding/doctor',
      doctorRequest({ accessCode: 'I AM A DOCTOR' }),
    ).expect(403);

    const body = response.body as { error: { code: string; details: { attemptsLeft: number } } };
    expect(body.error.code).toBe('INVALID_DOCTOR_CODE');
    expect(body.error.details.attemptsLeft).toBe(DOCTOR_CODE_FAILURE_LIMIT - 1);

    const user = await me(agent);
    expect(user.role).toBeNull();
    expect(user.doctor).toBeNull();
    const events = await context.database.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorUserId, user.id));
    expect(events.map((event) => event.action)).toContain('onboarding.doctor_code_rejected');
  });

  it(`locks the doctor path for an hour after ${DOCTOR_CODE_FAILURE_LIMIT} wrong codes`, async () => {
    const { agent } = await signIn(context);
    for (let attempt = 0; attempt < DOCTOR_CODE_FAILURE_LIMIT; attempt += 1) {
      await post(agent, '/api/onboarding/doctor', doctorRequest({ accessCode: 'guess' })).expect(
        403,
      );
    }

    const locked = await post(agent, '/api/onboarding/doctor', doctorRequest()).expect(429);
    expect(errorCode(locked)).toBe('TOO_MANY_ATTEMPTS');

    context.advance(61 * 60 * 1000);
    await post(agent, '/api/onboarding/doctor', doctorRequest()).expect(200);
  });

  it('is closed until an administrator sets a code', async () => {
    await revokeAllDoctorCodes();
    try {
      const { agent } = await signIn(context);

      const response = await post(agent, '/api/onboarding/doctor', doctorRequest()).expect(503);
      expect(errorCode(response)).toBe('DOCTOR_CODE_NOT_CONFIGURED');
    } finally {
      await setDoctorCode(context);
    }
  });

  it('stops accepting a code once it is revoked', async () => {
    await revokeAllDoctorCodes();
    try {
      await setDoctorCode(context, 'old-code');
      await revokeAllDoctorCodes();
      await setDoctorCode(context, 'new-code');
      const { agent } = await signIn(context);

      await post(agent, '/api/onboarding/doctor', doctorRequest({ accessCode: 'old-code' })).expect(
        403,
      );
      await post(agent, '/api/onboarding/doctor', doctorRequest({ accessCode: 'new-code' })).expect(
        200,
      );
    } finally {
      await revokeAllDoctorCodes();
      await setDoctorCode(context);
    }
  });

  it('accepts university email addresses only', async () => {
    const { agent } = await signIn(context);
    const response = await post(
      agent,
      '/api/onboarding/doctor',
      doctorRequest({ universityEmail: 'doctor@gmail.com' }),
    ).expect(400);

    expect(
      (response.body as { error: { fields: Record<string, string> } }).error.fields,
    ).toHaveProperty('universityEmail');
  });
});

describe('doctor onboarding: university email', () => {
  it('activates at once when the person signed in with that university Google account', async () => {
    const email = 'dr.nour@acu.edu.eg';
    const { agent } = await signIn(context, identity({ email }));

    const response = await post(
      agent,
      '/api/onboarding/doctor',
      doctorRequest({ universityEmail: email }),
    ).expect(200);

    expect(doctorOnboardingResponseSchema.parse(response.body).status).toBe('active');
    expect(context.mailer.sent).toHaveLength(0);
    const user = await me(agent);
    expect(user.role).toBe('doctor');
    expect(user.doctor?.status).toBe('active');
  });

  it('otherwise emails a six-digit code to the university address', async () => {
    const { agent } = await signIn(context);
    const request = doctorRequest();

    const response = await post(agent, '/api/onboarding/doctor', request).expect(200);

    expect(doctorOnboardingResponseSchema.parse(response.body)).toEqual({
      status: 'verification_sent',
      sentTo: maskEmail(request.universityEmail),
      resendAvailableInSeconds: EMAIL_CODE_RESEND_COOLDOWN_MS / 1000,
    });
    expect(context.mailer.sent).toHaveLength(1);
    expect(context.mailer.sent[0]?.to).toBe(request.universityEmail);
    expect(context.mailer.lastCode()).toMatch(/^\d{6}$/);

    const user = await me(agent);
    expect(user.role).toBeNull();
    expect(user.doctor?.status).toBe('pending_verification');
  });

  it('activates the doctor with the right code', async () => {
    const { agent } = await signIn(context);
    await post(agent, '/api/onboarding/doctor', doctorRequest()).expect(200);

    const response = await post(agent, '/api/onboarding/doctor/verify', {
      code: context.mailer.lastCode(),
    }).expect(200);

    const user = meResponseSchema.parse(response.body).user;
    expect(user.role).toBe('doctor');
    expect(user.doctor?.status).toBe('active');
  });

  it('counts wrong codes and stops after five', async () => {
    const { agent } = await signIn(context);
    await post(agent, '/api/onboarding/doctor', doctorRequest()).expect(200);
    const right = context.mailer.lastCode();
    const wrong = right === '000000' ? '111111' : '000000';

    for (let attempt = 1; attempt < EMAIL_CODE_MAX_ATTEMPTS; attempt += 1) {
      const response = await post(agent, '/api/onboarding/doctor/verify', { code: wrong }).expect(
        400,
      );
      const body = response.body as { error: { details: { attemptsLeft: number } } };
      expect(body.error.details.attemptsLeft).toBe(EMAIL_CODE_MAX_ATTEMPTS - attempt);
    }
    await post(agent, '/api/onboarding/doctor/verify', { code: wrong }).expect(429);

    const afterLimit = await post(agent, '/api/onboarding/doctor/verify', { code: right }).expect(
      429,
    );
    expect(errorCode(afterLimit)).toBe('TOO_MANY_ATTEMPTS');
  });

  it('holds the limit even when guesses arrive at the same time', async () => {
    const { agent } = await signIn(context);
    await post(agent, '/api/onboarding/doctor', doctorRequest()).expect(200);
    const wrong = context.mailer.lastCode() === '000000' ? '111111' : '000000';

    const responses = await Promise.all(
      Array.from({ length: 2 * EMAIL_CODE_MAX_ATTEMPTS }, () =>
        post(agent, '/api/onboarding/doctor/verify', { code: wrong }),
      ),
    );

    const refusedAsWrong = responses.filter((response) => response.status === 400).length;
    expect(refusedAsWrong).toBeLessThanOrEqual(EMAIL_CODE_MAX_ATTEMPTS - 1);
    expect(responses.every((response) => [400, 429].includes(response.status))).toBe(true);
  });

  it('expires codes after ten minutes', async () => {
    const { agent } = await signIn(context);
    await post(agent, '/api/onboarding/doctor', doctorRequest()).expect(200);
    const code = context.mailer.lastCode();
    context.advance(EMAIL_CODE_TTL_MS + 1000);

    const response = await post(agent, '/api/onboarding/doctor/verify', { code }).expect(410);
    expect(errorCode(response)).toBe('EMAIL_CODE_EXPIRED');
  });

  it('resends a new code after a minute, and the old one stops working', async () => {
    const { agent } = await signIn(context);
    await post(agent, '/api/onboarding/doctor', doctorRequest()).expect(200);
    const first = context.mailer.lastCode();

    const tooSoon = await post(agent, '/api/onboarding/doctor/resend').expect(429);
    expect(errorCode(tooSoon)).toBe('RESEND_TOO_SOON');

    context.advance(EMAIL_CODE_RESEND_COOLDOWN_MS);
    await post(agent, '/api/onboarding/doctor/resend').expect(200);
    const second = context.mailer.lastCode();

    if (first !== second) {
      await post(agent, '/api/onboarding/doctor/verify', { code: first }).expect(400);
    }
    await post(agent, '/api/onboarding/doctor/verify', { code: second }).expect(200);
  });

  it('reports a failed email and lets the doctor try again straight away', async () => {
    const { agent } = await signIn(context);
    const request = doctorRequest();
    context.mailer.failNext = true;

    const failed = await post(agent, '/api/onboarding/doctor', request).expect(502);
    expect(errorCode(failed)).toBe('EMAIL_DELIVERY_FAILED');

    await post(agent, '/api/onboarding/doctor', request).expect(200);
  });

  it('keeps staff IDs and university emails to one account each', async () => {
    const first = await signIn(context);
    const request = doctorRequest();
    await post(first.agent, '/api/onboarding/doctor', request).expect(200);

    const second = await signIn(context);
    const sameStaffId = await post(
      second.agent,
      '/api/onboarding/doctor',
      doctorRequest({ staffId: request.staffId }),
    ).expect(409);
    expect(errorCode(sameStaffId)).toBe('STAFF_ID_TAKEN');

    const sameEmail = await post(
      second.agent,
      '/api/onboarding/doctor',
      doctorRequest({ universityEmail: request.universityEmail }),
    ).expect(409);
    expect(errorCode(sameEmail)).toBe('UNIVERSITY_EMAIL_TAKEN');
  });

  it('lets someone who started as a doctor become a student instead', async () => {
    const { agent } = await signIn(context);
    await post(agent, '/api/onboarding/doctor', doctorRequest()).expect(200);

    const response = await post(agent, '/api/onboarding/student', {
      learningLanguage: 'zh',
      goal: 'culture',
    }).expect(200);

    const user = meResponseSchema.parse(response.body).user;
    expect(user.role).toBe('student');
    expect(user.doctor).toBeNull();
  });

  it('sends a pending doctor back to the code step when they sign in again', async () => {
    const person = identity();
    const { agent } = await signIn(context, person);
    await post(agent, '/api/onboarding/doctor', doctorRequest()).expect(200);

    expect((await signIn(context, person)).landing).toBe('/welcome/doctor');
  });
});

describe('maskEmail', () => {
  it('hides most of the local part', () => {
    expect(maskEmail('mona.adel@acu.edu.eg')).toBe('m••••••@acu.edu.eg');
    expect(maskEmail('ab@acu.edu.eg')).toBe('a•@acu.edu.eg');
  });
});
