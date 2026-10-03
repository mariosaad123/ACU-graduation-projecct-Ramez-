import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type Notification,
  type NotificationKind,
  type NotificationSettings,
  type NotificationsResponse,
} from '@acu/shared';
import { and, count, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  doctorProfiles,
  groups,
  notificationSettings,
  notifications,
  pushSubscriptions,
  users,
} from '../../db/schema';
import type { Logger } from '../../lib/logger';
import { avatarUrlOf } from '../users/avatar';
import type { PushMessage, PushSender } from './push';

export interface NotifyContext {
  db: Database;
  push: PushSender;
  logger: Logger;
  now: () => Date;
}

export interface NotifyEvent {
  kind: NotificationKind;
  groupId: string;
  groupName: string;
  /** Who caused it; never notified about their own action. */
  actor: { id: string; name: string } | null;
  recipients: readonly string[];
  messageId?: string;
  announcementId?: string;
  gradeColumnId?: string;
  excerpt: string | null;
  /** Every chat message is pushed to those who ask for it, but not kept in the app. */
  inApp?: boolean;
}

const EXCERPT_LENGTH = 140;

/** Where a notification leads: the message, the announcement, the grades or the group. */
export function linkOf(row: {
  kind: NotificationKind;
  groupId: string;
  messageId: string | null;
  announcementId: string | null;
}): string {
  const base = `/app/groups/${row.groupId}`;
  if (row.announcementId) {
    return `${base}?tab=announcements&announcement=${row.announcementId}`;
  }
  if (row.messageId) {
    return `${base}?tab=chat&message=${row.messageId}`;
  }
  if (row.kind === 'grade') {
    return `${base}?tab=grades`;
  }
  return base;
}

const SETTING_OF: Record<NotificationKind, keyof NotificationSettings | null> = {
  mention: 'mentions',
  announcement: 'announcements',
  poll: 'polls',
  grade: 'grades',
  message: 'messages',
  // Being given a role in a group is always worth knowing.
  role: null,
};

type Locale = 'ar' | 'en';

const TITLES: Record<Locale, Record<NotificationKind, (actor: string, group: string) => string>> = {
  ar: {
    mention: (actor, group) => `${actor} ذكرك في ${group}`,
    announcement: (_actor, group) => `إعلان جديد في ${group}`,
    poll: (actor, group) => `${actor} سأل في ${group}`,
    grade: (_actor, group) => `درجة جديدة في ${group}`,
    role: (_actor, group) => `دور جديد لك في ${group}`,
    message: (actor, group) => `${actor} في ${group}`,
  },
  en: {
    mention: (actor, group) => `${actor} mentioned you in ${group}`,
    announcement: (_actor, group) => `New announcement in ${group}`,
    poll: (actor, group) => `${actor} asked in ${group}`,
    grade: (_actor, group) => `New grade in ${group}`,
    role: (_actor, group) => `A new role for you in ${group}`,
    message: (actor, group) => `${actor} in ${group}`,
  },
};

const ROLE_LABELS: Record<Locale, Record<string, string>> = {
  ar: { assistant: 'مساعد تدريس', moderator: 'مشرف', representative: 'مندوب الدفعة' },
  en: {
    assistant: 'Teaching assistant',
    moderator: 'Moderator',
    representative: 'Class representative',
  },
};

export function excerptOf(text: string | null): string | null {
  if (!text) {
    return null;
  }
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH - 1)}…` : flat;
}

async function settingsOf(
  db: Database,
  userIds: string[],
): Promise<Map<string, NotificationSettings>> {
  const rows = await db
    .select()
    .from(notificationSettings)
    .where(inArray(notificationSettings.userId, userIds));
  return new Map(rows.map((row) => [row.userId, row]));
}

/**
 * Tells people about something in a group: kept in the app (unless it is a plain message) and
 * pushed to the browsers of those who allow that kind. Pushing never delays or fails the request.
 */
export async function notify(context: NotifyContext, event: NotifyEvent): Promise<void> {
  const recipients = [...new Set(event.recipients)].filter((id) => id !== event.actor?.id);
  if (recipients.length === 0) {
    return;
  }
  const { db } = context;
  const excerpt = excerptOf(event.excerpt);
  const link = linkOf({
    kind: event.kind,
    groupId: event.groupId,
    messageId: event.messageId ?? null,
    announcementId: event.announcementId ?? null,
  });

  if (event.inApp !== false) {
    await db.insert(notifications).values(
      recipients.map((userId) => ({
        userId,
        kind: event.kind,
        groupId: event.groupId,
        actorId: event.actor?.id ?? null,
        messageId: event.messageId ?? null,
        announcementId: event.announcementId ?? null,
        gradeColumnId: event.gradeColumnId ?? null,
        excerpt,
        createdAt: context.now(),
      })),
    );
  }

  if (!context.push.publicKey) {
    return;
  }
  const setting = SETTING_OF[event.kind];
  const settings = setting
    ? await settingsOf(db, recipients)
    : new Map<string, NotificationSettings>();
  const allowed = recipients.filter(
    (id) => !setting || (settings.get(id) ?? DEFAULT_NOTIFICATION_SETTINGS)[setting],
  );
  if (allowed.length === 0) {
    return;
  }
  const targets = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, allowed));

  const deliveries = targets.map(async (target) => {
    const message: PushMessage = {
      title: TITLES[target.locale][event.kind](event.actor?.name ?? '', event.groupName),
      body:
        event.kind === 'role' ? (ROLE_LABELS[target.locale][excerpt ?? ''] ?? '') : (excerpt ?? ''),
      url: link,
      tag: event.kind === 'message' ? `group-${event.groupId}` : `${event.kind}-${link}`,
    };
    const outcome = await context.push.send(target, message);
    if (outcome === 'gone') {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, target.id));
    }
  });
  void Promise.allSettled(deliveries).then((results) => {
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      context.logger.warn({ failures: failures.length }, 'Some push notifications failed');
    }
  });
}

const PAGE_SIZE = 20;

export async function listNotifications(
  db: Database,
  userId: string,
  before: Date | null,
): Promise<NotificationsResponse> {
  const rows = await db
    .select({
      notification: notifications,
      groupName: groups.name,
      actor: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
        avatarFileId: users.avatarFileId,
      },
      actorDoctorName: doctorProfiles.displayName,
    })
    .from(notifications)
    .innerJoin(groups, eq(groups.id, notifications.groupId))
    .leftJoin(users, eq(users.id, notifications.actorId))
    .leftJoin(doctorProfiles, eq(doctorProfiles.userId, notifications.actorId))
    .where(
      and(
        eq(notifications.userId, userId),
        before ? lt(notifications.createdAt, before) : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(PAGE_SIZE + 1);

  const list: Notification[] = rows.slice(0, PAGE_SIZE).map((row) => ({
    id: row.notification.id,
    kind: row.notification.kind,
    group: { id: row.notification.groupId, name: row.groupName },
    actor: row.actor
      ? {
          id: row.actor.id,
          name: row.actorDoctorName ?? row.actor.name,
          avatarUrl: avatarUrlOf(row.actor),
        }
      : null,
    excerpt: row.notification.excerpt,
    link: linkOf(row.notification),
    createdAt: row.notification.createdAt.toISOString(),
    read: row.notification.readAt !== null,
  }));
  return {
    notifications: list,
    unread: await unreadCount(db, userId),
    hasMore: rows.length > PAGE_SIZE,
  };
}

export async function unreadCount(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.total ?? 0;
}

export async function markNotificationsRead(
  db: Database,
  userId: string,
  ids: string[] | 'all',
  now: Date,
): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        ids === 'all' ? undefined : inArray(notifications.id, ids),
      ),
    );
}

/** Opening a message, an announcement or the grades marks what led there as read. */
export async function markReadFor(
  db: Database,
  userId: string,
  target: { messageId?: string; announcementId?: string; groupGrades?: string },
  now: Date,
): Promise<void> {
  const condition = target.messageId
    ? eq(notifications.messageId, target.messageId)
    : target.announcementId
      ? eq(notifications.announcementId, target.announcementId)
      : target.groupGrades
        ? and(eq(notifications.groupId, target.groupGrades), eq(notifications.kind, 'grade'))
        : undefined;
  if (!condition) {
    return;
  }
  await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), condition));
}

export async function getSettings(db: Database, userId: string): Promise<NotificationSettings> {
  const [row] = await db
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId));
  if (!row) {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
  const { mentions, announcements, polls, grades, messages } = row;
  return { mentions, announcements, polls, grades, messages };
}

export async function saveSettings(
  db: Database,
  userId: string,
  settings: NotificationSettings,
  now: Date,
): Promise<NotificationSettings> {
  await db
    .insert(notificationSettings)
    .values({ userId, ...settings, updatedAt: now })
    .onConflictDoUpdate({
      target: notificationSettings.userId,
      set: { ...settings, updatedAt: now },
    });
  return settings;
}

export async function subscribe(
  db: Database,
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  locale: 'ar' | 'en',
): Promise<void> {
  // An endpoint belongs to one browser; whoever signs in there last receives its notifications.
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      locale,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        locale,
      },
    });
}

export async function unsubscribe(db: Database, userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function subscriptionCount(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return row?.total ?? 0;
}
