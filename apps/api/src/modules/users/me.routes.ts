import { PHOTO_MAX_BYTES, type MeResponse } from '@acu/shared';
import { eq } from 'drizzle-orm';
import { Router, type Request, type Response } from 'express';
import { users } from '../../db/schema';
import type { AppDependencies } from '../../http/dependencies';
import { HttpError } from '../../http/http-error';
import { authOf, requireAuth } from '../../http/middleware/require-auth';
import { acceptOneFile, uploadedFile } from '../../http/middleware/upload';
import { recordAudit } from '../audit/audit';
import { removeFile, saveUpload } from '../files/files.service';
import { toSessionUser } from './session-user';

export function createMeRouter(deps: AppDependencies): Router {
  const { db, storage, now } = deps;
  const router = Router();
  router.use(requireAuth);

  const respondWithAccount = async (req: Request, res: Response) => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, authOf(req).user.id));
    if (!user) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue');
    }
    const body: MeResponse = { user: await toSessionUser(db, user) };
    res.set('Cache-Control', 'no-store').json(body);
  };

  router.get('/', async (req, res) => {
    await respondWithAccount(req, res);
  });

  /** Replaces the profile photo; the previous upload, if any, is deleted with it. */
  router.put('/avatar', acceptOneFile('file', PHOTO_MAX_BYTES), async (req, res) => {
    const upload = uploadedFile(req);
    if (!upload) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Choose a photo', {
        fields: { file: 'required' },
      });
    }
    const user = authOf(req).user;
    const saved = await saveUpload({ db, storage }, user, upload, 'avatar');
    const [previous] = await db
      .select({ avatarFileId: users.avatarFileId })
      .from(users)
      .where(eq(users.id, user.id));
    await db
      .update(users)
      .set({ avatarFileId: saved.id, updatedAt: now() })
      .where(eq(users.id, user.id));
    await removeFile({ db, storage }, previous?.avatarFileId ?? null);
    await recordAudit(db, {
      at: now(),
      actorUserId: user.id,
      action: 'profile.photo_changed',
      ipAddress: req.ip,
    });
    await respondWithAccount(req, res);
  });

  /** Back to the Google picture. */
  router.delete('/avatar', async (req, res) => {
    const user = authOf(req).user;
    const [current] = await db
      .select({ avatarFileId: users.avatarFileId })
      .from(users)
      .where(eq(users.id, user.id));
    if (current?.avatarFileId) {
      await db
        .update(users)
        .set({ avatarFileId: null, updatedAt: now() })
        .where(eq(users.id, user.id));
      await removeFile({ db, storage }, current.avatarFileId);
    }
    await respondWithAccount(req, res);
  });

  return router;
}
