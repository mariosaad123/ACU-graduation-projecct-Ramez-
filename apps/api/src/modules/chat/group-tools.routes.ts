import {
  ANNOUNCEMENT_MAX_ATTACHMENTS,
  ATTACHMENT_KINDS,
  CHAT_VIDEO_MAX_BYTES,
  announcementFieldsSchema,
  chatMuteSchema,
  createPollSchema,
  editAnnouncementSchema,
  gradeColumnInputSchema,
  gradeInputSchema,
  markAnnouncementsReadSchema,
  votePollSchema,
  type AttachmentKind,
} from '@acu/shared';
import { Router, type Request } from 'express';
import * as z from 'zod/mini';
import type { AppDependencies } from '../../http/dependencies';
import { HttpError } from '../../http/http-error';
import { authOf, requireAuth } from '../../http/middleware/require-auth';
import { acceptFiles, uploadedFiles } from '../../http/middleware/upload';
import { withBody } from '../../http/middleware/validate';
import {
  announcementReceipts,
  createAnnouncement,
  deleteAnnouncement,
  editAnnouncement,
  listAnnouncements,
  markAnnouncementsRead,
} from '../announcements/announcements.service';
import { groupFiles } from '../files/group-files.service';
import {
  createColumn,
  deleteColumn,
  getGradebook,
  myGrades,
  reorderColumns,
  setGrades,
  updateColumn,
} from '../gradebook/gradebook.service';
import { parseId } from '../groups/groups.service';
import { setMemberMuted, type ChatContext } from './chat.service';
import {
  EXPORT_REPORTS,
  exportGroup,
  sendWorkbook,
  type ExportReport,
} from '../export/export.service';
import { closePoll, createPoll, votePoll } from './polls.service';

const gradesBodySchema = z.object({
  entries: z
    .array(z.object({ studentId: z.string().check(z.uuid()), ...gradeInputSchema.shape }))
    .check(z.minLength(1), z.maxLength(500)),
});

const orderSchema = z.object({
  ids: z.array(z.string().check(z.uuid())).check(z.maxLength(200)),
});

/**
 * What a group offers beyond its chat: its files, polls, announcements, gradebook, and the staff's
 * moderation. Who may do what is decided in the services.
 */
export function createGroupToolsRouter(deps: AppDependencies): Router {
  const { db, storage, push, logger, now } = deps;
  const router = Router({ mergeParams: true });
  router.use(requireAuth);

  const contextFor = (req: Request): ChatContext => ({
    db,
    storage,
    push,
    logger,
    now,
    ipAddress: req.ip,
  });
  const userOf = (req: Request) => authOf(req).user;
  const groupIdOf = (req: Request) => parseId(req.params.groupId);

  /* Moderation */

  router.post(
    '/members/:studentId/mute',
    withBody(chatMuteSchema, async (req, res, body) => {
      const result = await setMemberMuted(
        contextFor(req),
        userOf(req),
        groupIdOf(req),
        parseId(req.params.studentId, 'Student'),
        body.muted,
      );
      res.json(result);
    }),
  );

  /* Files */

  router.get('/files', async (req, res) => {
    const kind = (ATTACHMENT_KINDS as readonly unknown[]).includes(req.query.kind)
      ? (req.query.kind as AttachmentKind)
      : 'image';
    const search =
      typeof req.query.q === 'string' && req.query.q.trim()
        ? req.query.q.trim().slice(0, 80)
        : null;
    const before =
      typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before))
        ? new Date(req.query.before)
        : null;
    const result = await groupFiles(db, userOf(req), groupIdOf(req), { kind, search, before });
    res.set('Cache-Control', 'no-store').json(result);
  });

  /* Polls */

  router.post(
    '/polls',
    withBody(createPollSchema, async (req, res, body) => {
      const message = await createPoll(contextFor(req), userOf(req), groupIdOf(req), body);
      res.status(201).json({ message });
    }),
  );

  router.post(
    '/polls/:pollId/vote',
    withBody(votePollSchema, async (req, res, body) => {
      const message = await votePoll(
        contextFor(req),
        userOf(req),
        groupIdOf(req),
        parseId(req.params.pollId, 'Poll'),
        body.optionIds,
      );
      res.json({ message });
    }),
  );

  router.post('/polls/:pollId/close', async (req, res) => {
    const message = await closePoll(
      contextFor(req),
      userOf(req),
      groupIdOf(req),
      parseId(req.params.pollId, 'Poll'),
    );
    res.json({ message });
  });

  /* Announcements */

  router.get('/announcements', async (req, res) => {
    const announcements = await listAnnouncements(contextFor(req), userOf(req), groupIdOf(req));
    res.set('Cache-Control', 'no-store').json({ announcements });
  });

  router.post(
    '/announcements',
    acceptFiles('files', CHAT_VIDEO_MAX_BYTES, ANNOUNCEMENT_MAX_ATTACHMENTS),
    async (req, res) => {
      const fields = announcementFieldsSchema.safeParse(req.body ?? {});
      if (!fields.success) {
        throw new HttpError(400, 'VALIDATION_FAILED', 'Some fields are not valid', {
          fields: Object.fromEntries(
            fields.error.issues.map((issue) => [String(issue.path[0]), 'invalid']),
          ),
        });
      }
      const announcement = await createAnnouncement(
        contextFor(req),
        userOf(req),
        groupIdOf(req),
        {
          title: fields.data.title,
          body: fields.data.body,
          important: fields.data.important === 'true',
        },
        uploadedFiles(req),
      );
      res.status(201).json({ announcement });
    },
  );

  router.post(
    '/announcements/read',
    withBody(markAnnouncementsReadSchema, async (req, res, body) => {
      await markAnnouncementsRead(contextFor(req), userOf(req), groupIdOf(req), body.ids);
      res.status(204).end();
    }),
  );

  router.patch(
    '/announcements/:announcementId',
    withBody(editAnnouncementSchema, async (req, res, body) => {
      const announcement = await editAnnouncement(
        contextFor(req),
        userOf(req),
        groupIdOf(req),
        parseId(req.params.announcementId, 'Announcement'),
        body,
      );
      res.json({ announcement });
    }),
  );

  router.delete('/announcements/:announcementId', async (req, res) => {
    await deleteAnnouncement(
      contextFor(req),
      userOf(req),
      groupIdOf(req),
      parseId(req.params.announcementId, 'Announcement'),
    );
    res.status(204).end();
  });

  router.get('/announcements/:announcementId/receipts', async (req, res) => {
    const receipts = await announcementReceipts(
      contextFor(req),
      userOf(req),
      groupIdOf(req),
      parseId(req.params.announcementId, 'Announcement'),
    );
    res.set('Cache-Control', 'no-store').json(receipts);
  });

  /* Gradebook */

  router.get('/gradebook', async (req, res) => {
    const gradebook = await getGradebook(contextFor(req), userOf(req), groupIdOf(req));
    res.set('Cache-Control', 'no-store').json(gradebook);
  });

  router.post(
    '/gradebook/columns',
    withBody(gradeColumnInputSchema, async (req, res, body) => {
      const column = await createColumn(contextFor(req), userOf(req), groupIdOf(req), body);
      res.status(201).json({ column });
    }),
  );

  router.patch(
    '/gradebook/columns/:columnId',
    withBody(z.partial(gradeColumnInputSchema), async (req, res, body) => {
      const column = await updateColumn(
        contextFor(req),
        userOf(req),
        groupIdOf(req),
        parseId(req.params.columnId, 'Column'),
        body,
      );
      res.json({ column });
    }),
  );

  router.delete('/gradebook/columns/:columnId', async (req, res) => {
    await deleteColumn(
      contextFor(req),
      userOf(req),
      groupIdOf(req),
      parseId(req.params.columnId, 'Column'),
    );
    res.status(204).end();
  });

  router.put(
    '/gradebook/order',
    withBody(orderSchema, async (req, res, body) => {
      const columns = await reorderColumns(contextFor(req), userOf(req), groupIdOf(req), body.ids);
      res.json({ columns });
    }),
  );

  router.put(
    '/gradebook/columns/:columnId/grades',
    withBody(gradesBodySchema, async (req, res, body) => {
      const grades = await setGrades(
        contextFor(req),
        userOf(req),
        groupIdOf(req),
        parseId(req.params.columnId, 'Column'),
        body.entries,
      );
      res.json({ grades });
    }),
  );

  router.get('/export', async (req, res) => {
    const report = (EXPORT_REPORTS as readonly unknown[]).includes(req.query.report)
      ? (req.query.report as ExportReport)
      : 'full';
    const locale = req.query.lang === 'en' ? 'en' : 'ar';
    const { buffer, fileName } = await exportGroup(
      { db, now, ipAddress: req.ip },
      userOf(req),
      groupIdOf(req),
      report,
      locale,
    );
    sendWorkbook(res, buffer, fileName);
  });

  router.get('/my-grades', async (req, res) => {
    const grades = await myGrades(contextFor(req), userOf(req), groupIdOf(req));
    res.set('Cache-Control', 'no-store').json(grades);
  });

  return router;
}
