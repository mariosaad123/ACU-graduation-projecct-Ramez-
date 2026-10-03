import * as z from 'zod/mini';

/**
 * What someone can be told about: being mentioned, a new announcement or poll in their group, a
 * grade published to them, a role given to them in a group, or a new message (when they ask).
 */
export const NOTIFICATION_KINDS = [
  'mention',
  'announcement',
  'poll',
  'grade',
  'role',
  'message',
  'assignment',
  'nudge',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const notificationSchema = z.object({
  id: z.string(),
  kind: z.enum(NOTIFICATION_KINDS),
  group: z.object({ id: z.string(), name: z.string() }),
  actor: z.nullable(
    z.object({ id: z.string(), name: z.string(), avatarUrl: z.nullable(z.string()) }),
  ),
  /** A short text: the message, the announcement title, the poll question or the column title. */
  excerpt: z.nullable(z.string()),
  /** Where the notification leads in the app. */
  link: z.string(),
  createdAt: z.string(),
  read: z.boolean(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationsResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  unread: z.number(),
  hasMore: z.boolean(),
});
export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>;

export const unreadNotificationsSchema = z.object({ unread: z.number() });

export const markNotificationsReadSchema = z.union([
  z.object({ ids: z.array(z.string().check(z.uuid())).check(z.minLength(1), z.maxLength(100)) }),
  z.object({ all: z.literal(true) }),
]);
export type MarkNotificationsRead = z.infer<typeof markNotificationsReadSchema>;

/** Which kinds reach someone as browser notifications. In-app notifications are always kept. */
export const notificationSettingsSchema = z.object({
  mentions: z.boolean(),
  announcements: z.boolean(),
  polls: z.boolean(),
  grades: z.boolean(),
  assignments: z.boolean(),
  /** Every chat message in their groups: off unless they turn it on. */
  messages: z.boolean(),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  mentions: true,
  announcements: true,
  polls: true,
  grades: true,
  assignments: true,
  messages: false,
};

/** A browser's push subscription, as PushSubscription.toJSON() gives it. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().check(z.url(), z.maxLength(1000)),
  keys: z.object({
    p256dh: z.string().check(z.minLength(10), z.maxLength(200)),
    auth: z.string().check(z.minLength(10), z.maxLength(100)),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushKeyResponseSchema = z.object({ publicKey: z.nullable(z.string()) });
