import type { TFunction } from 'i18next';
import { ApiError } from '../../lib/api';

/** A general message for errors a form does not handle itself. */
export function describeApiError(t: TFunction, error: unknown): string {
  if (!(error instanceof ApiError)) {
    return t('errors.generic');
  }
  switch (error.code) {
    case 'NETWORK_ERROR':
      return t('errors.network');
    case 'RATE_LIMITED':
      return t('errors.rateLimited');
    case 'ALREADY_ONBOARDED':
      return t('errors.alreadyOnboarded');
    case 'LANGUAGE_ALREADY_ADDED':
      return t('errors.languageAlreadyAdded');
    case 'LANGUAGE_NOT_ADDED':
      return t('errors.languageNotAdded');
    case 'LAST_LANGUAGE':
      return t('errors.lastLanguage');
    case 'LANGUAGE_IN_USE':
      return t('errors.languageInUse');
    case 'INVALID_JOIN_CODE':
      return t('errors.invalidJoinCode');
    case 'JOIN_CLOSED':
      return t('errors.joinClosed');
    case 'ALREADY_MEMBER':
      return t('errors.alreadyMember');
    case 'REMOVED_FROM_GROUP':
      return t('errors.removedFromGroup');
    case 'GROUP_ARCHIVED':
      return t('errors.groupArchived');
    case 'STUDENT_NOT_FOUND':
      return t('errors.studentNotFound');
    case 'NOT_SUSPENDER':
      return t('errors.notSuspender');
    case 'ALREADY_SUSPENDED':
      return t('errors.alreadySuspended');
    case 'MEMBER_STATE_CHANGED':
      return t('errors.memberStateChanged');
    case 'NOT_FOUND':
      return t('errors.notFound');
    default:
      return t('errors.generic');
  }
}
