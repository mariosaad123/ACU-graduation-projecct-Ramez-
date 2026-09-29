import type { MeResponse } from '@acu/shared';
import { Router } from 'express';
import type { AppDependencies } from '../../http/dependencies';
import { authOf, requireAuth } from '../../http/middleware/require-auth';
import { toSessionUser } from './session-user';

export function createMeRouter({ db }: AppDependencies): Router {
  const router = Router();

  router.get('/', requireAuth, async (req, res) => {
    const body: MeResponse = { user: await toSessionUser(db, authOf(req).user) };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}
