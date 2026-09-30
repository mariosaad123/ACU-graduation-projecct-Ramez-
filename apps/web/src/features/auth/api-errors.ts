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
    default:
      return t('errors.generic');
  }
}
