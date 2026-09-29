import { parseCookie } from 'cookie';
import type { Request } from 'express';

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.get('cookie');
  if (!header) {
    return undefined;
  }
  return parseCookie(header)[name];
}
