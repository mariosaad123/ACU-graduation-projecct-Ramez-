import { LEARNING_LANGUAGES, studentLanguageRequestSchema, type MeResponse } from '@acu/shared';
import { Router, type Request, type Response } from 'express';
import * as z from 'zod/mini';
import type { AppDependencies } from '../../http/dependencies';
import { HttpError } from '../../http/http-error';
import { authOf, requireRole } from '../../http/middleware/require-auth';
import { withBody } from '../../http/middleware/validate';
import { toSessionUser } from '../users/session-user';
import {
  addStudentLanguage,
  removeStudentLanguage,
  switchActiveLanguage,
  type StudentLanguagesContext,
} from './student-languages.service';

const languageParam = z.enum(LEARNING_LANGUAGES);

export function createStudentLanguagesRouter(deps: AppDependencies): Router {
  const { db, now } = deps;
  const router = Router();
  router.use(requireRole('student'));

  const contextFor = (req: Request): StudentLanguagesContext => ({
    db,
    now,
    ipAddress: req.ip,
  });

  /** Every change answers with the updated account, so the web app can refresh in one step. */
  const respondWithAccount = async (req: Request, res: Response, status = 200) => {
    const body: MeResponse = { user: await toSessionUser(db, authOf(req).user) };
    res.status(status).set('Cache-Control', 'no-store').json(body);
  };

  router.post(
    '/languages',
    withBody(studentLanguageRequestSchema, async (req, res, body) => {
      await addStudentLanguage(contextFor(req), authOf(req).user, body.language);
      await respondWithAccount(req, res, 201);
    }),
  );

  router.put(
    '/active-language',
    withBody(studentLanguageRequestSchema, async (req, res, body) => {
      await switchActiveLanguage(contextFor(req), authOf(req).user, body.language);
      await respondWithAccount(req, res);
    }),
  );

  router.delete('/languages/:language', async (req, res) => {
    const language = languageParam.safeParse(req.params.language);
    if (!language.success) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Some fields are not valid', {
        fields: { language: 'invalid' },
      });
    }
    await removeStudentLanguage(contextFor(req), authOf(req).user, language.data);
    await respondWithAccount(req, res);
  });

  return router;
}
