import type { PersonResponse } from '@acu/shared';
import { Router } from 'express';
import type { AppDependencies } from '../../http/dependencies';
import { authOf, requireAuth } from '../../http/middleware/require-auth';
import { parseId } from '../groups/groups.service';
import { personProfile } from './people.service';

export function createPeopleRouter(deps: AppDependencies): Router {
  const { db } = deps;
  const router = Router();
  router.use(requireAuth);

  router.get('/:personId', async (req, res) => {
    const person = await personProfile(
      db,
      authOf(req).user,
      parseId(req.params.personId, 'Person'),
    );
    const body: PersonResponse = { person };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}
