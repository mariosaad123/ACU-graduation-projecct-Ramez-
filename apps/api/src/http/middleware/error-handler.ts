import type { ErrorRequestHandler } from 'express';
import { HttpError, type ErrorResponseBody } from '../http-error';

interface BodyParserError {
  type: string;
  status: number;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    'status' in error &&
    typeof error.status === 'number'
  );
}

function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (isBodyParserError(error)) {
    if (error.type === 'entity.parse.failed') {
      return new HttpError(400, 'MALFORMED_JSON', 'Request body is not valid JSON');
    }
    if (error.type === 'entity.too.large') {
      return new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    }
  }

  return new HttpError(500, 'INTERNAL_ERROR', 'Something went wrong on our side');
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const httpError = toHttpError(error);

  if (httpError.status >= 500) {
    req.log.error({ err: error }, 'Unhandled error');
  }

  const body: ErrorResponseBody = {
    error: {
      code: httpError.code,
      message: httpError.message,
      requestId: typeof req.id === 'string' ? req.id : 'unknown',
      ...(httpError.details && { details: httpError.details }),
      ...(httpError.fields && { fields: httpError.fields }),
    },
  };

  res.status(httpError.status).json(body);
};
