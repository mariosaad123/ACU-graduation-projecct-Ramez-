import {
  markNotificationsReadSchema,
  notificationSettingsSchema,
  pushSubscriptionSchema,
  type NotificationsResponse,
} from '@acu/shared';
import { Router } from 'express';
import * as z from 'zod/mini';
import type { AppDependencies } from '../../http/dependencies';
import { HttpError } from '../../http/http-error';
import { authOf, requireAuth } from '../../http/middleware/require-auth';
import { withBody } from '../../http/middleware/validate';
import {
  getSettings,
  listNotifications,
  markNotificationsRead,
  saveSettings,
  subscribe,
  subscriptionCount,
  unreadCount,
  unsubscribe,
} from './notifications.service';

const subscribeSchema = z.object({
  subscription: pushSubscriptionSchema,
  locale: z.enum(['ar', 'en']),
});

const unsubscribeSchema = z.object({ endpoint: z.string().check(z.maxLength(1000)) });

/** The bell in the header, browser push subscriptions, and what each person wants pushed. */
export function createNotificationsRouter(deps: AppDependencies): Router {
  const { db, push, now } = deps;
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const before =
      typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before))
        ? new Date(req.query.before)
        : null;
    const body: NotificationsResponse = await listNotifications(db, authOf(req).user.id, before);
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.get('/unread', async (req, res) => {
    res
      .set('Cache-Control', 'no-store')
      .json({ unread: await unreadCount(db, authOf(req).user.id) });
  });

  router.post(
    '/read',
    withBody(markNotificationsReadSchema, async (req, res, body) => {
      await markNotificationsRead(db, authOf(req).user.id, 'all' in body ? 'all' : body.ids, now());
      res.status(204).end();
    }),
  );

  router.get('/settings', async (req, res) => {
    const userId = authOf(req).user.id;
    res.set('Cache-Control', 'no-store').json({
      settings: await getSettings(db, userId),
      push: { available: push.publicKey !== null, devices: await subscriptionCount(db, userId) },
    });
  });

  router.put(
    '/settings',
    withBody(notificationSettingsSchema, async (req, res, body) => {
      const settings = await saveSettings(db, authOf(req).user.id, body, now());
      res.json({ settings });
    }),
  );

  router.get('/push-key', (_req, res) => {
    res.json({ publicKey: push.publicKey });
  });

  router.post(
    '/subscriptions',
    withBody(subscribeSchema, async (req, res, body) => {
      if (!push.publicKey) {
        throw new HttpError(503, 'PUSH_NOT_CONFIGURED', 'Browser notifications are not set up');
      }
      await subscribe(db, authOf(req).user.id, body.subscription, body.locale);
      res.status(204).end();
    }),
  );

  router.post(
    '/subscriptions/remove',
    withBody(unsubscribeSchema, async (req, res, body) => {
      await unsubscribe(db, authOf(req).user.id, body.endpoint);
      res.status(204).end();
    }),
  );

  return router;
}
