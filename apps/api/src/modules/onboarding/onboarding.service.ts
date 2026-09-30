import {
  EMAIL_CODE_LENGTH,
  type DoctorOnboardingRequest,
  type DoctorOnboardingResponse,
  type StudentOnboardingRequest,
} from '@acu/shared';
import { and, desc, eq, isNull, lt, ne, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../../db/client';
import { uniqueViolation } from '../../db/errors';
import {
  doctorAccessCodes,
  doctorLanguages,
  doctorProfiles,
  emailVerifications,
  studentLanguages,
  studentProfiles,
  users,
  type User,
} from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { hashSecret, randomNumericCode, verifySecret } from '../../lib/crypto';
import { countRecentAudit, recordAudit } from '../audit/audit';
import { replaceDoctorLanguages } from '../doctors/doctor-languages.service';
import type { Mailer } from '../mail/mailer';
import { doctorVerificationEmail } from '../mail/templates';

const MINUTE_MS = 60 * 1000;

export const DOCTOR_CODE_FAILURE_LIMIT = 5;
export const DOCTOR_CODE_FAILURE_WINDOW_MS = 60 * MINUTE_MS;
export const EMAIL_CODE_TTL_MS = 10 * MINUTE_MS;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
export const EMAIL_CODE_RESEND_COOLDOWN_MS = MINUTE_MS;

const PURPOSE = 'doctor_university_email';

export interface OnboardingContext {
  db: Database;
  mailer: Mailer;
  now: () => Date;
  universityEmailDomain: string;
  ipAddress: string | undefined;
}

/** "mona.adel@acu.edu.eg" becomes "m••••••@acu.edu.eg". */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const hidden = '•'.repeat(Math.min(Math.max(local.length - 1, 1), 6));
  return `${local.slice(0, 1)}${hidden}@${domain}`;
}

/** The profile goes first: it points at one of the languages. */
async function deleteStudentProfile(tx: Transaction, userId: string): Promise<void> {
  await tx.delete(studentProfiles).where(eq(studentProfiles.userId, userId));
  await tx.delete(studentLanguages).where(eq(studentLanguages.userId, userId));
}

function assertNotOnboarded(user: User): void {
  if (user.role) {
    throw new HttpError(409, 'ALREADY_ONBOARDED', 'This account is already set up');
  }
}

export async function completeStudentOnboarding(
  context: OnboardingContext,
  user: User,
  request: StudentOnboardingRequest,
): Promise<void> {
  assertNotOnboarded(user);
  const { db, now } = context;

  await db.transaction(async (tx) => {
    // Someone who started the doctor steps and changed their mind leaves nothing behind.
    await tx.delete(emailVerifications).where(eq(emailVerifications.userId, user.id));
    await tx.delete(doctorProfiles).where(eq(doctorProfiles.userId, user.id));
    await tx.delete(doctorLanguages).where(eq(doctorLanguages.userId, user.id));
    await deleteStudentProfile(tx, user.id);

    await tx
      .insert(studentLanguages)
      .values(
        request.languages.map((language) => ({ userId: user.id, language, enrolledAt: now() })),
      );
    await tx.insert(studentProfiles).values({
      userId: user.id,
      activeLanguage: request.activeLanguage,
      goal: request.goal,
    });
    await tx.update(users).set({ role: 'student', updatedAt: now() }).where(eq(users.id, user.id));
  });

  await recordAudit(db, {
    at: now(),
    actorUserId: user.id,
    action: 'onboarding.student_completed',
    metadata: {
      languages: request.languages,
      activeLanguage: request.activeLanguage,
      goal: request.goal,
    },
    ipAddress: context.ipAddress,
  });
}

async function checkDoctorAccessCode(
  context: OnboardingContext,
  user: User,
  accessCode: string,
): Promise<void> {
  const { db, now } = context;

  const since = new Date(now().getTime() - DOCTOR_CODE_FAILURE_WINDOW_MS);
  const failures = await countRecentAudit(db, user.id, 'onboarding.doctor_code_rejected', since);
  if (failures >= DOCTOR_CODE_FAILURE_LIMIT) {
    throw new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong codes, try again later', {
      details: { retryAfterSeconds: DOCTOR_CODE_FAILURE_WINDOW_MS / 1000 },
    });
  }

  const activeCodes = await db
    .select({ codeHash: doctorAccessCodes.codeHash })
    .from(doctorAccessCodes)
    .where(isNull(doctorAccessCodes.revokedAt));
  if (activeCodes.length === 0) {
    throw new HttpError(503, 'DOCTOR_CODE_NOT_CONFIGURED', 'Doctor registration is not open yet');
  }

  const results = await Promise.all(
    activeCodes.map(({ codeHash }) => verifySecret(codeHash, accessCode)),
  );
  if (!results.includes(true)) {
    const attemptsLeft = Math.max(DOCTOR_CODE_FAILURE_LIMIT - failures - 1, 0);
    await recordAudit(db, {
      at: now(),
      actorUserId: user.id,
      action: 'onboarding.doctor_code_rejected',
      metadata: { attemptsLeft },
      ipAddress: context.ipAddress,
    });
    throw new HttpError(403, 'INVALID_DOCTOR_CODE', 'The doctor verification code is not correct', {
      details: { attemptsLeft },
    });
  }
}

async function assertDoctorDetailsAvailable(
  db: Database,
  user: User,
  request: DoctorOnboardingRequest,
): Promise<void> {
  const [staffIdOwner] = await db
    .select({ userId: doctorProfiles.userId })
    .from(doctorProfiles)
    .where(and(eq(doctorProfiles.staffId, request.staffId), ne(doctorProfiles.userId, user.id)));
  if (staffIdOwner) {
    throw new HttpError(409, 'STAFF_ID_TAKEN', 'This staff ID is already registered', {
      fields: { staffId: 'taken' },
    });
  }

  const [emailOwner] = await db
    .select({ userId: doctorProfiles.userId })
    .from(doctorProfiles)
    .where(
      and(
        eq(doctorProfiles.universityEmail, request.universityEmail),
        ne(doctorProfiles.userId, user.id),
      ),
    );
  if (emailOwner) {
    throw new HttpError(
      409,
      'UNIVERSITY_EMAIL_TAKEN',
      'This university email is already registered',
      {
        fields: { universityEmail: 'taken' },
      },
    );
  }
}

async function activateDoctor(
  context: OnboardingContext,
  user: User,
  via: 'google_account' | 'email_code',
  verificationId?: string,
): Promise<void> {
  const { db, now } = context;

  await db.transaction(async (tx) => {
    if (verificationId) {
      await tx
        .update(emailVerifications)
        .set({ consumedAt: now() })
        .where(eq(emailVerifications.id, verificationId));
    }
    await tx
      .update(doctorProfiles)
      .set({ status: 'active', verifiedAt: now(), updatedAt: now() })
      .where(eq(doctorProfiles.userId, user.id));
    await tx.update(users).set({ role: 'doctor', updatedAt: now() }).where(eq(users.id, user.id));
    await deleteStudentProfile(tx, user.id);
  });

  await recordAudit(db, {
    at: now(),
    actorUserId: user.id,
    action: 'onboarding.doctor_activated',
    metadata: { via },
    ipAddress: context.ipAddress,
  });
}

async function latestPendingVerification(db: Database, userId: string) {
  const [verification] = await db
    .select()
    .from(emailVerifications)
    .where(
      and(
        eq(emailVerifications.userId, userId),
        eq(emailVerifications.purpose, PURPOSE),
        isNull(emailVerifications.consumedAt),
      ),
    )
    .orderBy(desc(emailVerifications.sentAt))
    .limit(1);
  return verification;
}

function assertResendAllowed(sentAt: Date | undefined, now: Date): void {
  if (!sentAt) {
    return;
  }
  const waitMs = sentAt.getTime() + EMAIL_CODE_RESEND_COOLDOWN_MS - now.getTime();
  if (waitMs > 0) {
    throw new HttpError(429, 'RESEND_TOO_SOON', 'Please wait before asking for a new code', {
      details: { retryAfterSeconds: Math.ceil(waitMs / 1000) },
    });
  }
}

async function sendEmailCode(
  context: OnboardingContext,
  user: User,
  email: string,
  displayName: string,
): Promise<DoctorOnboardingResponse> {
  const { db, mailer, now } = context;
  const code = randomNumericCode(EMAIL_CODE_LENGTH);

  await db
    .delete(emailVerifications)
    .where(and(eq(emailVerifications.userId, user.id), eq(emailVerifications.purpose, PURPOSE)));

  const [verification] = await db
    .insert(emailVerifications)
    .values({
      userId: user.id,
      email,
      purpose: PURPOSE,
      codeHash: await hashSecret(code),
      sentAt: now(),
      expiresAt: new Date(now().getTime() + EMAIL_CODE_TTL_MS),
    })
    .returning({ id: emailVerifications.id });

  try {
    await mailer.send(
      doctorVerificationEmail({
        to: email,
        displayName,
        code,
        expiresInMinutes: EMAIL_CODE_TTL_MS / MINUTE_MS,
      }),
    );
  } catch (error) {
    if (verification) {
      await db.delete(emailVerifications).where(eq(emailVerifications.id, verification.id));
    }
    throw new HttpError(502, 'EMAIL_DELIVERY_FAILED', 'The email could not be sent', {
      details: { cause: error instanceof Error ? error.name : 'unknown' },
    });
  }

  await recordAudit(db, {
    at: now(),
    actorUserId: user.id,
    action: 'onboarding.doctor_verification_sent',
    metadata: { email: maskEmail(email) },
    ipAddress: context.ipAddress,
  });

  return {
    status: 'verification_sent',
    sentTo: maskEmail(email),
    resendAvailableInSeconds: EMAIL_CODE_RESEND_COOLDOWN_MS / 1000,
  };
}

export async function startDoctorOnboarding(
  context: OnboardingContext,
  user: User,
  request: DoctorOnboardingRequest,
): Promise<DoctorOnboardingResponse> {
  assertNotOnboarded(user);
  const { db, now, universityEmailDomain } = context;

  if (!request.universityEmail.endsWith(`@${universityEmailDomain}`)) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Use your university email address', {
      fields: { universityEmail: 'not_university_email' },
    });
  }

  await checkDoctorAccessCode(context, user, request.accessCode);
  await assertDoctorDetailsAvailable(db, user, request);

  const pending = await latestPendingVerification(db, user.id);
  const ownsGoogleAccount = user.emailVerified && user.email === request.universityEmail;
  if (!ownsGoogleAccount) {
    assertResendAllowed(pending?.sentAt, now());
  }

  const details = {
    staffId: request.staffId,
    displayName: request.displayName,
    universityEmail: request.universityEmail,
  };
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(doctorProfiles)
        .values({ userId: user.id, ...details, status: 'pending_verification' })
        .onConflictDoUpdate({
          target: doctorProfiles.userId,
          set: { ...details, status: 'pending_verification', verifiedAt: null, updatedAt: now() },
        });
      await replaceDoctorLanguages(tx, user.id, request.languages, now());
    });
  } catch (error) {
    const constraint = uniqueViolation(error);
    if (constraint?.includes('staff_id')) {
      throw new HttpError(409, 'STAFF_ID_TAKEN', 'This staff ID is already registered', {
        fields: { staffId: 'taken' },
      });
    }
    if (constraint?.includes('university_email')) {
      throw new HttpError(
        409,
        'UNIVERSITY_EMAIL_TAKEN',
        'This university email is already registered',
        {
          fields: { universityEmail: 'taken' },
        },
      );
    }
    throw error;
  }

  // Signing in with the university Google account already proves ownership of the address.
  if (ownsGoogleAccount) {
    await activateDoctor(context, user, 'google_account');
    return { status: 'active', sentTo: null, resendAvailableInSeconds: 0 };
  }

  return sendEmailCode(context, user, request.universityEmail, request.displayName);
}

export async function resendDoctorEmailCode(
  context: OnboardingContext,
  user: User,
): Promise<DoctorOnboardingResponse> {
  assertNotOnboarded(user);
  const { db, now } = context;

  const [profile] = await db
    .select()
    .from(doctorProfiles)
    .where(eq(doctorProfiles.userId, user.id));
  if (profile?.status !== 'pending_verification') {
    throw new HttpError(400, 'NO_PENDING_VERIFICATION', 'There is no email to confirm');
  }

  const pending = await latestPendingVerification(db, user.id);
  assertResendAllowed(pending?.sentAt, now());

  return sendEmailCode(context, user, profile.universityEmail, profile.displayName);
}

export async function confirmDoctorEmailCode(
  context: OnboardingContext,
  user: User,
  code: string,
): Promise<void> {
  assertNotOnboarded(user);
  const { db, now } = context;

  const [profile] = await db
    .select()
    .from(doctorProfiles)
    .where(eq(doctorProfiles.userId, user.id));
  const verification = await latestPendingVerification(db, user.id);
  if (
    profile?.status !== 'pending_verification' ||
    verification?.email !== profile.universityEmail
  ) {
    throw new HttpError(400, 'NO_PENDING_VERIFICATION', 'There is no email to confirm');
  }

  if (verification.expiresAt.getTime() <= now().getTime()) {
    throw new HttpError(410, 'EMAIL_CODE_EXPIRED', 'This code has expired, ask for a new one');
  }

  // Count the attempt before checking it, atomically, so parallel guesses cannot exceed the limit.
  const [counted] = await db
    .update(emailVerifications)
    .set({ attempts: sql`${emailVerifications.attempts} + 1` })
    .where(
      and(
        eq(emailVerifications.id, verification.id),
        lt(emailVerifications.attempts, EMAIL_CODE_MAX_ATTEMPTS),
      ),
    )
    .returning({ attempts: emailVerifications.attempts });

  if (!counted) {
    throw new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong codes, ask for a new one');
  }

  if (!(await verifySecret(verification.codeHash, code))) {
    const attemptsLeft = EMAIL_CODE_MAX_ATTEMPTS - counted.attempts;
    await recordAudit(db, {
      at: now(),
      actorUserId: user.id,
      action: 'onboarding.doctor_email_code_rejected',
      metadata: { attemptsLeft },
      ipAddress: context.ipAddress,
    });
    if (attemptsLeft === 0) {
      throw new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong codes, ask for a new one');
    }
    throw new HttpError(400, 'INVALID_EMAIL_CODE', 'This code is not correct', {
      details: { attemptsLeft },
    });
  }

  await activateDoctor(context, user, 'email_code', verification.id);
}
