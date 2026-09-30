import {
  PHOTO_MAX_BYTES,
  addMemberSchema,
  chatMuteSchema,
  doctorLanguagesRequestSchema,
  groupCreateSchema,
  groupUpdateSchema,
  moveMemberSchema,
  suspendStudentSchema,
  type MeResponse,
} from '@acu/shared';
import { Router, type Request } from 'express';
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema';
import type { AppDependencies } from '../../http/dependencies';
import { HttpError } from '../../http/http-error';
import { authOf, requireRole } from '../../http/middleware/require-auth';
import { acceptOneFile, uploadedFile } from '../../http/middleware/upload';
import { withBody } from '../../http/middleware/validate';
import { updateDoctorLanguages } from '../doctors/doctor-languages.service';
import { toSessionUser } from '../users/session-user';
import {
  MEMBER_ACTIONS,
  addMemberByEmail,
  changeMember,
  createGroup,
  listGroups,
  listMembers,
  moveMember,
  parseId,
  regenerateJoinCode,
  setChatMuted,
  setGroupArchived,
  setGroupPhoto,
  updateGroup,
  type GroupsContext,
  type MemberAction,
} from './groups.service';
import { suspendStudent, unsuspendStudent } from './suspension.service';

function isMemberAction(value: string | undefined): value is MemberAction {
  return (MEMBER_ACTIONS as readonly (string | undefined)[]).includes(value);
}

/** Everything a doctor does with languages, groups and the students in them. */
export function createDoctorRouter(deps: AppDependencies): Router {
  const { db, now, storage } = deps;
  const router = Router();
  router.use(requireRole('doctor'));

  const contextFor = (req: Request): GroupsContext => ({ db, now, ipAddress: req.ip });
  const doctorOf = (req: Request) => authOf(req).user;

  router.put(
    '/languages',
    withBody(doctorLanguagesRequestSchema, async (req, res, body) => {
      await updateDoctorLanguages(contextFor(req), doctorOf(req), body.languages);
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, doctorOf(req).id));
      if (!user) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue');
      }
      const response: MeResponse = { user: await toSessionUser(db, user) };
      res.set('Cache-Control', 'no-store').json(response);
    }),
  );

  router.get('/groups', async (req, res) => {
    res.set('Cache-Control', 'no-store').json({ groups: await listGroups(db, doctorOf(req).id) });
  });

  router.post(
    '/groups',
    withBody(groupCreateSchema, async (req, res, body) => {
      const group = await createGroup(contextFor(req), doctorOf(req), body);
      res.status(201).json({ group });
    }),
  );

  router.patch(
    '/groups/:groupId',
    withBody(groupUpdateSchema, async (req, res, body) => {
      const groupId = parseId(req.params.groupId);
      res.json({ group: await updateGroup(contextFor(req), doctorOf(req), groupId, body) });
    }),
  );

  router.post('/groups/:groupId/code', async (req, res) => {
    const groupId = parseId(req.params.groupId);
    res.json({ group: await regenerateJoinCode(contextFor(req), doctorOf(req), groupId) });
  });

  router.post('/groups/:groupId/archive', async (req, res) => {
    const groupId = parseId(req.params.groupId);
    res.json({ group: await setGroupArchived(contextFor(req), doctorOf(req), groupId, true) });
  });

  router.post('/groups/:groupId/restore', async (req, res) => {
    const groupId = parseId(req.params.groupId);
    res.json({ group: await setGroupArchived(contextFor(req), doctorOf(req), groupId, false) });
  });

  router.put('/groups/:groupId/photo', acceptOneFile('file', PHOTO_MAX_BYTES), async (req, res) => {
    const upload = uploadedFile(req);
    if (!upload) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Choose a photo', {
        fields: { file: 'required' },
      });
    }
    const group = await setGroupPhoto(
      { ...contextFor(req), storage },
      doctorOf(req),
      parseId(req.params.groupId),
      upload,
    );
    res.json({ group });
  });

  router.delete('/groups/:groupId/photo', async (req, res) => {
    const group = await setGroupPhoto(
      { ...contextFor(req), storage },
      doctorOf(req),
      parseId(req.params.groupId),
      null,
    );
    res.json({ group });
  });

  router.post(
    '/groups/:groupId/members/:studentId/chat-mute',
    withBody(chatMuteSchema, async (req, res, body) => {
      const member = await setChatMuted(
        contextFor(req),
        doctorOf(req),
        parseId(req.params.groupId),
        parseId(req.params.studentId, 'Student'),
        body.muted,
      );
      res.json({ member });
    }),
  );

  router.get('/groups/:groupId/members', async (req, res) => {
    const groupId = parseId(req.params.groupId);
    const members = await listMembers(db, doctorOf(req), groupId);
    res.set('Cache-Control', 'no-store').json({ members });
  });

  router.post(
    '/groups/:groupId/members',
    withBody(addMemberSchema, async (req, res, body) => {
      const groupId = parseId(req.params.groupId);
      const member = await addMemberByEmail(contextFor(req), doctorOf(req), groupId, body.email);
      res.status(201).json({ member });
    }),
  );

  router.post(
    '/groups/:groupId/members/:studentId/move',
    withBody(moveMemberSchema, async (req, res, body) => {
      const groupId = parseId(req.params.groupId);
      const studentId = parseId(req.params.studentId, 'Student');
      const member = await moveMember(
        contextFor(req),
        doctorOf(req),
        groupId,
        studentId,
        body.toGroupId,
      );
      res.json({ member });
    }),
  );

  router.post('/groups/:groupId/members/:studentId/:action', async (req, res) => {
    const { action } = req.params;
    if (!isMemberAction(action)) {
      throw new HttpError(404, 'NOT_FOUND', 'Unknown action');
    }
    const groupId = parseId(req.params.groupId);
    const studentId = parseId(req.params.studentId, 'Student');
    const member = await changeMember(contextFor(req), doctorOf(req), groupId, studentId, action);
    res.json({ member });
  });

  router.post(
    '/students/:studentId/suspend',
    withBody(suspendStudentSchema, async (req, res, body) => {
      const studentId = parseId(req.params.studentId, 'Student');
      await suspendStudent(contextFor(req), doctorOf(req), studentId, body.reason);
      res.status(204).end();
    }),
  );

  router.post('/students/:studentId/unsuspend', async (req, res) => {
    const studentId = parseId(req.params.studentId, 'Student');
    await unsuspendStudent(contextFor(req), doctorOf(req), studentId);
    res.status(204).end();
  });

  return router;
}
