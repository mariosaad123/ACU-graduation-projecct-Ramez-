import type { RequestHandler } from 'express';
import { HttpError } from '../http-error';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
};
