import { joinCodeSchema, type JoinResult } from '@acu/shared';
import { Router, type Request } from 'express';
import type { AppDependencies } from '../../http/dependencies';
import { authOf, requireRole } from '../../http/middleware/require-auth';
import { withBody } from '../../http/middleware/validate';
import { toSessionUser } from '../users/session-user';
import { parseId, type GroupsContext } from './groups.service';
import { joinGroup, leaveGroup, listStudentGroups, previewJoin } from './membership.service';

/** A student's side of groups: joining with a code, their list, leaving. */
export function createStudentGroupsRouter(deps: AppDependencies): Router {
  const { db, now } = deps;
  const router = Router();
  router.use(requireRole('student'));

  const contextFor = (req: Request): GroupsContext => ({ db, now, ipAddress: req.ip });

  router.get('/groups', async (req, res) => {
    const groups = await listStudentGroups(db, authOf(req).user);
    res.set('Cache-Control', 'no-store').json({ groups });
  });

  // The code travels in the body, not the URL, so it stays out of logs and browser history.
  router.post(
    '/join/preview',
    withBody(joinCodeSchema, async (req, res, body) => {
      res.json(await previewJoin(contextFor(req), authOf(req).user, body.code));
    }),
  );

  router.post(
    '/join',
    withBody(joinCodeSchema, async (req, res, body) => {
      const student = authOf(req).user;
      const result = await joinGroup(contextFor(req), student, body.code);
      const response: JoinResult = { ...result, user: await toSessionUser(db, student) };
      res.status(201).json(response);
    }),
  );

  router.post('/groups/:groupId/leave', async (req, res) => {
    await leaveGroup(contextFor(req), authOf(req).user, parseId(req.params.groupId));
    res.status(204).end();
  });

  return router;
}
