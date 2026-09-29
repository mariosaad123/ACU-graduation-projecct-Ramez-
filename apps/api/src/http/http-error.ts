import type { ApiErrorBody, ApiErrorCode } from '@acu/shared';

interface HttpErrorOptions {
  /** Machine-readable extras the client can use, e.g. attempts left or seconds to wait. */
  details?: Record<string, unknown>;
  /** Per-field validation messages. */
  fields?: Record<string, string>;
}

export class HttpError extends Error {
  readonly details: Record<string, unknown> | undefined;
  readonly fields: Record<string, string> | undefined;

  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    options: HttpErrorOptions = {},
  ) {
    super(message);
    this.name = 'HttpError';
    this.details = options.details;
    this.fields = options.fields;
  }
}

export type ErrorResponseBody = ApiErrorBody;
