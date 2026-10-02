import type { Request, RequestHandler, Response } from 'express';
import type * as z from 'zod/mini';
import { HttpError } from '../http-error';

function toValidationError(issues: readonly { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || '_';
    fields[key] ??= issue.message;
  }
  return new HttpError(400, 'VALIDATION_FAILED', 'Some fields are not valid', { fields });
}

/**
 * Parses the JSON body with a shared contract before the handler runs, so the handler receives
 * clean, typed data. Unknown keys are dropped and every field error is reported by name.
 */
export function withBody<Schema extends z.ZodMiniType>(
  schema: Schema,
  handler: (req: Request, res: Response, body: z.infer<Schema>) => Promise<void>,
): RequestHandler {
  return async (req, res) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw toValidationError(result.error.issues);
    }
    await handler(req, res, result.data);
  };
}
