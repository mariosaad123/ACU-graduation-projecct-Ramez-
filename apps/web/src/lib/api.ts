import { apiErrorSchema } from '@acu/shared';
import type * as z from 'zod/mini';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** One of the shared API error codes, or NETWORK_ERROR when the server could not be reached. */
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** A number from `details`, e.g. attempts left or seconds to wait. */
  detail(key: string): number | undefined {
    const value = this.details[key];
    return typeof value === 'number' ? value : undefined;
  }
}

interface RequestOptions<Schema extends z.ZodMiniType> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Validates the response; the caller then receives typed data. */
  schema?: Schema;
}

async function toApiError(response: Response): Promise<ApiError> {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(payload);
  if (!parsed.success) {
    return new ApiError(response.status, 'INTERNAL_ERROR', response.statusText);
  }
  const { code, message, details, fields } = parsed.data.error;
  return new ApiError(response.status, code, message, details, fields);
}

/**
 * Calls our API on the same origin. The session cookie travels automatically, and browsers add
 * the Origin header to every request that changes data, which the API checks against cross-site
 * requests.
 */
export async function apiRequest<Schema extends z.ZodMiniType = z.ZodMiniUnknown>(
  path: string,
  { method = 'GET', body, schema }: RequestOptions<Schema> = {},
): Promise<z.infer<Schema>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'The server could not be reached');
  }

  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === 204) {
    return undefined as z.infer<Schema>;
  }

  const payload: unknown = await response.json();
  return (schema ? schema.parse(payload) : payload) as z.infer<Schema>;
}
