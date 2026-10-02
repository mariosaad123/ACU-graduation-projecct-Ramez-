import * as z from 'zod/mini';
import { LEARNING_LANGUAGES } from '../languages';
import {
  DOCTOR_STATUSES,
  EMAIL_CODE_LENGTH,
  LEARNING_GOALS,
  UNIVERSITY_EMAIL_DOMAIN,
  USER_ROLES,
} from '../roles';

const trimmed = (min: number, max: number) =>
  z.string().check(z.trim(), z.minLength(min), z.maxLength(max));

const learningLanguage = z.enum(LEARNING_LANGUAGES);

/**
 * Languages someone learns or teaches, in the order they were added. Never empty, never repeated.
 */
export const languageListSchema = z.array(learningLanguage).check(
  z.minLength(1),
  z.maxLength(LEARNING_LANGUAGES.length),
  z.refine((languages) => new Set(languages).size === languages.length, {
    message: 'duplicate_language',
  }),
);

/** The account as the web app sees it. Never contains secrets or other users' data. */
export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  /** The uploaded photo if there is one, otherwise the Google account picture. */
  avatarUrl: z.nullable(z.string()),
  /** True when the photo was uploaded here and can be removed. */
  customAvatar: z.boolean(),
  role: z.nullable(z.enum(USER_ROLES)),
  student: z.nullable(
    z.object({
      /** The language the student is studying right now; always one of `languages`. */
      activeLanguage: learningLanguage,
      languages: languageListSchema,
      goal: z.enum(LEARNING_GOALS),
    }),
  ),
  doctor: z.nullable(
    z.object({
      status: z.enum(DOCTOR_STATUSES),
      displayName: z.string(),
      staffId: z.string(),
      universityEmail: z.string(),
      /** The languages the doctor teaches; every group is in one of them. */
      languages: z.array(learningLanguage),
    }),
  ),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const meResponseSchema = z.object({ user: sessionUserSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;

export const studentOnboardingSchema = z
  .object({
    languages: languageListSchema,
    activeLanguage: learningLanguage,
    goal: z.enum(LEARNING_GOALS),
  })
  .check(
    z.refine((request) => request.languages.includes(request.activeLanguage), {
      message: 'not_selected',
      path: ['activeLanguage'],
    }),
  );
export type StudentOnboardingRequest = z.infer<typeof studentOnboardingSchema>;

/** Adding a language, or switching to one the student already learns. */
export const studentLanguageRequestSchema = z.object({ language: learningLanguage });
export type StudentLanguageRequest = z.infer<typeof studentLanguageRequestSchema>;

export const staffIdPattern = /^[A-Za-z0-9-]{3,20}$/;

export function isUniversityEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${UNIVERSITY_EMAIL_DOMAIN}`);
}

export const doctorOnboardingSchema = z.object({
  accessCode: trimmed(1, 100),
  staffId: z.string().check(z.trim(), z.regex(staffIdPattern)),
  displayName: trimmed(3, 80),
  languages: languageListSchema,
  universityEmail: z
    .string()
    .check(
      z.trim(),
      z.toLowerCase(),
      z.maxLength(254),
      z.email(),
      z.refine(isUniversityEmail, { message: 'not_university_email' }),
    ),
});
export type DoctorOnboardingRequest = z.infer<typeof doctorOnboardingSchema>;

/** Replaces the set of languages a doctor teaches. */
export const doctorLanguagesRequestSchema = z.object({ languages: languageListSchema });
export type DoctorLanguagesRequest = z.infer<typeof doctorLanguagesRequestSchema>;

export const doctorOnboardingResponseSchema = z.object({
  status: z.enum(['active', 'verification_sent']),
  /** Masked address, e.g. "m•••••@acu.edu.eg", shown on the code screen. */
  sentTo: z.nullable(z.string()),
  resendAvailableInSeconds: z.number(),
});
export type DoctorOnboardingResponse = z.infer<typeof doctorOnboardingResponseSchema>;

export const emailCodeSchema = z.object({
  code: z.string().check(z.trim(), z.regex(new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`))),
});
export type EmailCodeRequest = z.infer<typeof emailCodeSchema>;

/** Stable error codes the API returns; the web app maps them to translated messages. */
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'MALFORMED_JSON',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'CHAT_RATE_LIMITED',
  'CSRF_REJECTED',
  'INTERNAL_ERROR',
  'ALREADY_ONBOARDED',
  'INVALID_DOCTOR_CODE',
  'DOCTOR_CODE_NOT_CONFIGURED',
  'STAFF_ID_TAKEN',
  'UNIVERSITY_EMAIL_TAKEN',
  'NO_PENDING_VERIFICATION',
  'INVALID_EMAIL_CODE',
  'EMAIL_CODE_EXPIRED',
  'TOO_MANY_ATTEMPTS',
  'RESEND_TOO_SOON',
  'EMAIL_DELIVERY_FAILED',
  'LANGUAGE_ALREADY_ADDED',
  'LANGUAGE_NOT_ADDED',
  'LAST_LANGUAGE',
  'LANGUAGE_IN_USE',
  'INVALID_JOIN_CODE',
  'JOIN_CLOSED',
  'ALREADY_MEMBER',
  'REMOVED_FROM_GROUP',
  'GROUP_ARCHIVED',
  'STUDENT_NOT_FOUND',
  'NOT_SUSPENDER',
  'ALREADY_SUSPENDED',
  'MEMBER_STATE_CHANGED',
  'UNSUPPORTED_FILE',
  'FILE_TOO_LARGE',
  'CHAT_CLOSED',
  'CHAT_MUTED',
  'MESSAGE_NOT_EDITABLE',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.optional(z.record(z.string(), z.unknown())),
    fields: z.optional(z.record(z.string(), z.string())),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
