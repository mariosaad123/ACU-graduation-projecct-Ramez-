export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}
