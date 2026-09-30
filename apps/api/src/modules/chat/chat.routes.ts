import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_MESSAGE_MAX_LENGTH,
  editMessageSchema,
  markReadSchema,
} from '@acu/shared';
import { Router, type Request } from 'express';
import * as z from 'zod/mini';
import type { AppDependencies } from '../../http/dependencies';
import { HttpError } from '../../http/http-error';
import { authOf, requireAuth } from '../../http/middleware/require-auth';
import { acceptOneFile, uploadedFile } from '../../http/middleware/upload';
import { withBody } from '../../http/middleware/validate';
import { parseId } from '../groups/groups.service';
import {
  chatChanges,
  chatPage,
  deleteMessage,
  editMessage,
  groupView,
  markChatRead,
  postMessage,
  setPinned,
  type ChatContext,
} from './chat.service';

const postFields = z.object({
  body: z.optional(z.string().check(z.maxLength(CHAT_MESSAGE_MAX_LENGTH * 2))),
  replyToId: z.optional(z.string().check(z.uuid())),
});

function numberParam(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,15}$/.test(value)) {
    return null;
  }
  return Number(value);
}

/**
 * A group as seen by its doctor or one of its members, and its chat. Who may do what is decided in
 * the chat service; the routes only read requests and shape answers.
 */
export function createGroupChatRouter(deps: AppDependencies): Router {
  const { db, storage, now } = deps;
  const router = Router({ mergeParams: true });
  router.use(requireAuth);

  const contextFor = (req: Request): ChatContext => ({ db, storage, now, ipAddress: req.ip });
  const groupIdOf = (req: Request) => parseId(req.params.groupId);
  const messageIdOf = (req: Request) => parseId(req.params.messageId, 'Message');

  router.get('/', async (req, res) => {
    const group = await groupView(contextFor(req), authOf(req).user, groupIdOf(req));
    res.set('Cache-Control', 'no-store').json({ group });
  });

  router.get('/chat', async (req, res) => {
    const before = req.query.before === undefined ? null : numberParam(req.query.before);
    if (req.query.before !== undefined && before === null) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Invalid cursor', {
        fields: { before: 'invalid' },
      });
    }
    const page = await chatPage(contextFor(req), authOf(req).user, groupIdOf(req), before);
    res.set('Cache-Control', 'no-store').json(page);
  });

  router.get('/chat/changes', async (req, res) => {
    const since = numberParam(req.query.since);
    if (since === null) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Invalid cursor', {
        fields: { since: 'invalid' },
      });
    }
    const changes = await chatChanges(contextFor(req), authOf(req).user, groupIdOf(req), since);
    res.set('Cache-Control', 'no-store').json(changes);
  });

  router.post('/chat', acceptOneFile('file', CHAT_ATTACHMENT_MAX_BYTES), async (req, res) => {
    const fields = postFields.safeParse(req.body ?? {});
    if (!fields.success) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Some fields are not valid');
    }
    const message = await postMessage(
      contextFor(req),
      authOf(req).user,
      groupIdOf(req),
      { body: fields.data.body ?? '', replyToId: fields.data.replyToId ?? null },
      uploadedFile(req),
    );
    res.status(201).json({ message });
  });

  router.patch(
    '/chat/:messageId',
    withBody(editMessageSchema, async (req, res, body) => {
      const message = await editMessage(
        contextFor(req),
        authOf(req).user,
        groupIdOf(req),
        messageIdOf(req),
        body.body,
      );
      res.json({ message });
    }),
  );

  router.delete('/chat/:messageId', async (req, res) => {
    const message = await deleteMessage(
      contextFor(req),
      authOf(req).user,
      groupIdOf(req),
      messageIdOf(req),
    );
    res.json({ message });
  });

  for (const [path, pinned] of [
    ['/chat/:messageId/pin', true],
    ['/chat/:messageId/unpin', false],
  ] as const) {
    router.post(path, async (req, res) => {
      const message = await setPinned(
        contextFor(req),
        authOf(req).user,
        groupIdOf(req),
        messageIdOf(req),
        pinned,
      );
      res.json({ message });
    });
  }

  router.post(
    '/chat/read',
    withBody(markReadSchema, async (req, res, body) => {
      await markChatRead(contextFor(req), authOf(req).user, groupIdOf(req), body.seq);
      res.status(204).end();
    }),
  );

  return router;
}
