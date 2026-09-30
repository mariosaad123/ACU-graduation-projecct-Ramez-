import type { TFunction } from 'i18next';
import { ApiError } from '../../lib/api';
import { describeApiError } from '../auth/api-errors';

export type DoctorField = 'accessCode' | 'staffId' | 'displayName' | 'universityEmail';

export interface FormProblems {
  fields: Partial<Record<DoctorField, string>>;
  form: string | null;
}

/** The message for a field that failed validation, whichever side caught it. */
export function fieldMessage(t: TFunction, field: string): string {
  switch (field) {
    case 'staffId':
      return t('errors.staffIdFormat');
    case 'displayName':
      return t('errors.displayNameLength');
    case 'universityEmail':
      return t('errors.notUniversityEmail');
    default:
      return t('errors.required');
  }
}

const isDoctorField = (field: string): field is DoctorField =>
  ['accessCode', 'staffId', 'displayName', 'universityEmail'].includes(field);

/** Turns an API error from the details step into messages next to the right fields. */
export function doctorDetailsProblems(t: TFunction, error: unknown): FormProblems {
  if (!(error instanceof ApiError)) {
    return { fields: {}, form: describeApiError(t, error) };
  }

  switch (error.code) {
    case 'VALIDATION_FAILED': {
      const fields: FormProblems['fields'] = {};
      for (const field of Object.keys(error.fields)) {
        if (isDoctorField(field)) {
          fields[field] = fieldMessage(t, field);
        }
      }
      return { fields, form: null };
    }
    case 'INVALID_DOCTOR_CODE': {
      const attemptsLeft = error.detail('attemptsLeft');
      const suffix =
        attemptsLeft === undefined ? '' : ` ${t('errors.attemptsLeft', { count: attemptsLeft })}`;
      return { fields: { accessCode: `${t('errors.invalidDoctorCode')}${suffix}` }, form: null };
    }
    case 'TOO_MANY_ATTEMPTS':
      return { fields: {}, form: t('errors.tooManyDoctorCodes') };
    case 'DOCTOR_CODE_NOT_CONFIGURED':
      return { fields: {}, form: t('errors.codeNotConfigured') };
    case 'STAFF_ID_TAKEN':
      return { fields: { staffId: t('errors.staffIdTaken') }, form: null };
    case 'UNIVERSITY_EMAIL_TAKEN':
      return { fields: { universityEmail: t('errors.universityEmailTaken') }, form: null };
    case 'EMAIL_DELIVERY_FAILED':
      return { fields: {}, form: t('errors.emailDeliveryFailed') };
    default:
      return { fields: {}, form: describeApiError(t, error) };
  }
}

/** Messages for the email code step. `resend` marks errors that only a new code can fix. */
export function emailCodeProblem(
  t: TFunction,
  error: unknown,
): { message: string; needsNewCode: boolean; backToDetails: boolean } {
  if (!(error instanceof ApiError)) {
    return { message: describeApiError(t, error), needsNewCode: false, backToDetails: false };
  }
  switch (error.code) {
    case 'VALIDATION_FAILED':
      return { message: t('errors.emailCodeFormat'), needsNewCode: false, backToDetails: false };
    case 'INVALID_EMAIL_CODE': {
      const attemptsLeft = error.detail('attemptsLeft');
      const suffix =
        attemptsLeft === undefined ? '' : ` ${t('errors.attemptsLeft', { count: attemptsLeft })}`;
      return {
        message: `${t('errors.invalidEmailCode')}${suffix}`,
        needsNewCode: false,
        backToDetails: false,
      };
    }
    case 'EMAIL_CODE_EXPIRED':
      return { message: t('errors.emailCodeExpired'), needsNewCode: true, backToDetails: false };
    case 'TOO_MANY_ATTEMPTS':
      return { message: t('errors.tooManyEmailCodes'), needsNewCode: true, backToDetails: false };
    case 'NO_PENDING_VERIFICATION':
      return {
        message: t('errors.noPendingVerification'),
        needsNewCode: false,
        backToDetails: true,
      };
    case 'EMAIL_DELIVERY_FAILED':
      return {
        message: t('errors.emailDeliveryFailed'),
        needsNewCode: false,
        backToDetails: false,
      };
    default:
      return { message: describeApiError(t, error), needsNewCode: false, backToDetails: false };
  }
}
