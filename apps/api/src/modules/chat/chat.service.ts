import {
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_RATE_LIMIT_MAX,
  isStaff,
  type ChatChanges,
  type ChatMessage,
  type ChatPage,
  type GroupView,
} from '@acu/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  sql,
} from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  announcementReads,
  announcements,
  chatReads,
  doctorProfiles,
  groupMembers,
  groupMessages,
  users,
  type User,
} from '../../db/schema';
import { HttpError } from '../../http/http-error';
import type { Logger } from '../../lib/logger';
import { recordAudit } from '../audit/audit';
import { fileUrl, removeFile, saveUpload, type Upload } from '../files/files.service';
import type { FileStorage } from '../files/storage';
import {
  assertCan,
  assertNotArchived,
  chatOpenNow,
  groupAccess,
  groupParticipants,
  manualOverride,
  nextChatChange,
  type GroupAccess,
} from '../groups/access';
import { notify, type NotifyContext } from '../notifications/notifications.service';
import type { PushSender } from '../notifications/push';
import { avatarUrlOf } from '../users/avatar';
import {
  cleanMentions,
  findMessage,
  namesOf,
  nextVersion,
  oneMessage,
  plainText,
  toMessages,
} from './messages';

export interface ChatContext {
  db: Database;
  storage: FileStorage;
  push: PushSender;
  logger: Logger;
  now: () => Date;
  ipAddress: string | undefined;
}

const PAGE_SIZE = 50;
const CHANGES_LIMIT = 200;

export function notifyContext(context: ChatContext): NotifyContext {
  return { db: context.db, push: context.push, logger: context.logger, now: context.now };
}

function canPost(access: GroupAccess, now: Date): boolean {
  if (access.group.archivedAt || access.muted) {
    return false;
  }
  return access.can.postWhenClosed || chatOpenNow(access.group, now);
}

function assertCanPost(access: GroupAccess, now: Date): void {
  assertNotArchived(access);
  if (access.muted) {
    throw new HttpError(403, 'CHAT_MUTED', 'You were muted in this chat');
  }
  if (!access.can.postWhenClosed && !chatOpenNow(access.group, now)) {
    throw new HttpError(403, 'CHAT_CLOSED', 'Students cannot write in this chat now');
  }
}

/** Students follow the limit their doctor set for the group; the staff have the ceiling. */
function rateLimitOf(access: GroupAccess): number {
  return isStaff(access.role) ? CHAT_RATE_LIMIT_MAX : access.group.chatRateLimit;
}

async function lastReadSeq(db: Database, groupId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ seq: chatReads.lastReadSeq })
    .from(chatReads)
    .where(and(eq(chatReads.groupId, groupId), eq(chatReads.userId, userId)));
  return row?.seq ?? 0;
}

/** Remembers that the person opened the group, for the activity the staff see. */
async function markSeen(db: Database, groupId: string, userId: string, at: Date): Promise<void> {
  await db
    .insert(chatReads)
    .values({ groupId, userId, lastReadSeq: 0, lastSeenAt: at })
    .onConflictDoUpdate({
      target: [chatReads.groupId, chatReads.userId],
      set: { lastSeenAt: at },
    });
}

/** Announcements in the group that the person did not write and has not seen. */
export async function unreadAnnouncementCounts(
  db: Database,
  userId: string,
  groupIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (groupIds.length === 0) {
    return counts;
  }
  const rows = await db
    .select({ groupId: announcements.groupId, total: count() })
    .from(announcements)
    .leftJoin(
      announcementReads,
      and(
        eq(announcementReads.announcementId, announcements.id),
        eq(announcementReads.userId, userId),
      ),
    )
    .where(
      and(
        inArray(announcements.groupId, groupIds),
        isNull(announcements.deletedAt),
        ne(announcements.authorId, userId),
        isNull(announcementReads.userId),
      ),
    )
    .groupBy(announcements.groupId);
  for (const row of rows) {
    counts.set(row.groupId, row.total);
  }
  return counts;
}

export async function groupView(
  context: ChatContext,
  user: User,
  groupId: string,
): Promise<GroupView> {
  const { db } = context;
  const now = context.now();
  const access = await groupAccess(db, user, groupId);
  const { group } = access;
  await markSeen(db, group.id, user.id, now);
  const [doctor] = await db
    .select({
      displayName: doctorProfiles.displayName,
      avatarUrl: users.avatarUrl,
      avatarFileId: users.avatarFileId,
    })
    .from(users)
    .innerJoin(doctorProfiles, eq(doctorProfiles.userId, users.id))
    .where(eq(users.id, group.doctorId));
  const change = nextChatChange(group, now);
  const unread = await unreadAnnouncementCounts(db, user.id, [group.id]);

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    language: group.language,
    photoUrl: group.photoFileId ? fileUrl(group.photoFileId) : null,
    archived: group.archivedAt !== null,
    doctor: {
      id: group.doctorId,
      name: doctor?.displayName ?? '',
      avatarUrl: doctor ? avatarUrlOf(doctor) : null,
    },
    isDoctor: access.role === 'owner',
    role: access.role,
    can: access.can,
    unreadAnnouncements: unread.get(group.id) ?? 0,
    chat: {
      open: chatOpenNow(group, now),
      mode: group.chatSchedule ? 'scheduled' : group.chatOpen ? 'open' : 'closed',
      schedule: group.chatSchedule ?? null,
      manual: manualOverride(group, now) !== null,
      nextChange: change ? { at: change.at.toISOString(), opens: change.opens } : null,
      muted: access.muted,
      canPost: canPost(access, now),
      lastReadSeq: await lastReadSeq(db, group.id, user.id),
      rateLimit: rateLimitOf(access),
    },
  };
}

async function latestVersion(db: Database, groupId: string): Promise<number> {
  const [row] = await db
    // PostgreSQL returns bigint aggregates as text.
    .select({ version: sql`coalesce(max(${groupMessages.version}), 0)`.mapWith(Number) })
    .from(groupMessages)
    .where(eq(groupMessages.groupId, groupId));
  return row?.version ?? 0;
}

/** The newest messages, or the ones before `beforeSeq`, oldest first, with the pinned ones. */
export async function chatPage(
  context: ChatContext,
  user: User,
  groupId: string,
  beforeSeq: number | null,
): Promise<ChatPage> {
  const { db } = context;
  const now = context.now();
  const { group, role } = await groupAccess(db, user, groupId);
  const rows = await db
    .select()
    .from(groupMessages)
    .where(
      and(
        eq(groupMessages.groupId, group.id),
        beforeSeq === null ? undefined : lt(groupMessages.seq, beforeSeq),
      ),
    )
    .orderBy(desc(groupMessages.seq))
    .limit(PAGE_SIZE + 1);
  const hasOlder = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE).reverse();

  const pinned = await db
    .select()
    .from(groupMessages)
    .where(
      and(
        eq(groupMessages.groupId, group.id),
        isNotNull(groupMessages.pinnedAt),
        isNull(groupMessages.deletedAt),
      ),
    )
    .orderBy(desc(groupMessages.pinnedAt));

  return {
    messages: await toMessages(db, group, user, role, page, now),
    pinned: await toMessages(db, group, user, role, pinned, now),
    version: await latestVersion(db, group.id),
    hasOlder,
  };
}

/** Everything new or changed since `sinceVersion`: what a chat that is open asks for regularly. */
export async function chatChanges(
  context: ChatContext,
  user: User,
  groupId: string,
  sinceVersion: number,
): Promise<ChatChanges> {
  const { db } = context;
  const { group, role } = await groupAccess(db, user, groupId);
  const rows = await db
    .select()
    .from(groupMessages)
    .where(and(eq(groupMessages.groupId, group.id), gt(groupMessages.version, sinceVersion)))
    .orderBy(asc(groupMessages.version))
    .limit(CHANGES_LIMIT);
  const last = rows.at(-1);
  return {
    messages: await toMessages(db, group, user, role, rows, context.now()),
    version: last ? last.version : sinceVersion,
  };
}

export async function markRead(
  db: Database,
  groupId: string,
  userId: string,
  seq: number,
  at: Date,
): Promise<void> {
  await db
    .insert(chatReads)
    .values({ groupId, userId, lastReadSeq: seq, lastSeenAt: at })
    .onConflictDoUpdate({
      target: [chatReads.groupId, chatReads.userId],
      // Reading never moves backwards, whatever order the requests arrive in.
      set: { lastReadSeq: sql`greatest(${chatReads.lastReadSeq}, ${seq})`, lastSeenAt: at },
    });
}

export async function markChatRead(
  context: ChatContext,
  user: User,
  groupId: string,
  seq: number,
): Promise<void> {
  const { group } = await groupAccess(context.db, user, groupId);
  await markRead(context.db, group.id, user.id, seq, context.now());
}

/** Sends the notifications a new message calls for: mentions, and pushes to whoever wants all. */
async function announceMessage(
  context: ChatContext,
  access: GroupAccess,
  author: User,
  message: { id: string; body: string | null; mentions: string[]; mentionsAll: boolean },
  fallbackText: string,
): Promise<void> {
  const { group } = access;
  const participants = await groupParticipants(context.db, group);
  const people = await namesOf(context.db, [author.id, ...message.mentions]);
  const names = new Map([...people].map(([id, person]) => [id, person.name]));
  const text = message.body ? plainText(message.body, names) : fallbackText;
  const actor = { id: author.id, name: people.get(author.id)?.name ?? author.name };
  const event = { groupId: group.id, groupName: group.name, actor, messageId: message.id };

  const mentioned = message.mentionsAll ? [...participants.keys()] : message.mentions;
  await notify(notifyContext(context), {
    ...event,
    kind: 'mention',
    recipients: mentioned,
    excerpt: text,
  });
  const mentionedSet = new Set(mentioned);
  await notify(notifyContext(context), {
    ...event,
    kind: 'message',
    recipients: [...participants.keys()].filter((id) => !mentionedSet.has(id)),
    excerpt: text,
    inApp: false,
  });
}

export async function postMessage(
  context: ChatContext,
  user: User,
  groupId: string,
  input: { body: string; replyToId: string | null },
  upload: Upload | null,
): Promise<ChatMessage> {
  const { db, storage, now } = context;
  const access = await groupAccess(db, user, groupId);
  assertCanPost(access, now());
  const { group } = access;

  const participants = await groupParticipants(db, group);
  const mentions = cleanMentions(input.body, participants, access.can.mentionAll);
  const body = mentions.body;
  if (body.length > CHAT_MESSAGE_MAX_LENGTH) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'The message is too long', {
      fields: { body: 'too_long' },
    });
  }
  if (!body && !upload) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Write a message or attach a file', {
      fields: { body: 'required' },
    });
  }

  await assertWithinRate(db, access, user, now());

  if (input.replyToId) {
    await findMessage(db, group.id, input.replyToId);
  }

  const attachment = upload
    ? await saveUpload({ db, storage }, user, upload, 'chat', group.id)
    : null;
  let created;
  try {
    [created] = await db
      .insert(groupMessages)
      .values({
        groupId: group.id,
        authorId: user.id,
        body: body || null,
        attachmentFileId: attachment?.id ?? null,
        replyToId: input.replyToId,
        mentions: mentions.ids,
        mentionsAll: mentions.all,
        createdAt: now(),
      })
      .returning();
    if (!created) {
      throw new Error('Message was not created');
    }
  } catch (error) {
    await removeFile({ db, storage }, attachment?.id ?? null);
    throw error;
  }
  // Writing a message means having read everything up to it.
  await markRead(db, group.id, user.id, created.seq, now());
  await announceMessage(
    context,
    access,
    user,
    { id: created.id, body: created.body, mentions: mentions.ids, mentionsAll: mentions.all },
    attachment?.originalName ?? '',
  );
  return oneMessage(db, group, user, access.role, created.id, now());
}

/** At most the group's limit of messages (polls included) in any minute. */
export async function assertWithinRate(
  db: Database,
  access: GroupAccess,
  user: User,
  now: Date,
): Promise<void> {
  const since = new Date(now.getTime() - 60 * 1000);
  const [recent] = await db
    .select({ total: count() })
    .from(groupMessages)
    .where(
      and(
        eq(groupMessages.groupId, access.group.id),
        eq(groupMessages.authorId, user.id),
        gte(groupMessages.createdAt, since),
      ),
    );
  const limit = rateLimitOf(access);
  if ((recent?.total ?? 0) >= limit) {
    throw new HttpError(429, 'CHAT_RATE_LIMITED', 'Too many messages, wait a moment', {
      details: { limit },
    });
  }
}

export async function editMessage(
  context: ChatContext,
  user: User,
  groupId: string,
  messageId: string,
  text: string,
): Promise<ChatMessage> {
  const { db, now } = context;
  const access = await groupAccess(db, user, groupId);
  assertCanPost(access, now());
  const message = await findMessage(db, access.group.id, messageId);
  if (message.authorId !== user.id || message.deletedAt || message.body === null) {
    throw new HttpError(403, 'MESSAGE_NOT_EDITABLE', 'Only your own text messages can be edited');
  }
  const participants = await groupParticipants(db, access.group);
  const mentions = cleanMentions(text, participants, access.can.mentionAll);
  if (!mentions.body) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Write a message', {
      fields: { body: 'required' },
    });
  }
  await db
    .update(groupMessages)
    .set({
      body: mentions.body,
      mentions: mentions.ids,
      mentionsAll: mentions.all,
      editedAt: now(),
      version: nextVersion,
    })
    .where(eq(groupMessages.id, message.id));
  // Only people newly mentioned by the edit are told.
  const added = mentions.ids.filter((id) => !message.mentions.includes(id));
  if (added.length > 0 || (mentions.all && !message.mentionsAll)) {
    await announceMessage(
      context,
      access,
      user,
      {
        id: message.id,
        body: mentions.body,
        mentions: added,
        mentionsAll: mentions.all && !message.mentionsAll,
      },
      '',
    );
  }
  return oneMessage(db, access.group, user, access.role, message.id, now());
}

/**
 * Deletes a message for everyone: its text and attachment are gone and it shows as deleted. Authors
 * delete their own; the staff any; a moderator the students' messages. Others' deletions are audited.
 */
export async function deleteMessage(
  context: ChatContext,
  user: User,
  groupId: string,
  messageId: string,
): Promise<ChatMessage> {
  const { db, storage, now } = context;
  const access = await groupAccess(db, user, groupId);
  const message = await findMessage(db, access.group.id, messageId);
  if (message.authorId !== user.id) {
    // Someone who has left the group counts as a student.
    const authorRole =
      (await groupParticipants(db, access.group)).get(message.authorId) ?? 'student';
    const allowed =
      access.can.moderate &&
      (isStaff(access.role) || (!isStaff(authorRole) && authorRole !== 'moderator'));
    if (!allowed) {
      throw new HttpError(403, 'FORBIDDEN', 'You cannot delete this message');
    }
  }
  if (!message.deletedAt) {
    await db
      .update(groupMessages)
      .set({
        body: null,
        attachmentFileId: null,
        pinnedAt: null,
        mentions: [],
        mentionsAll: false,
        deletedAt: now(),
        deletedByUserId: user.id,
        version: nextVersion,
      })
      .where(eq(groupMessages.id, message.id));
    await removeFile({ db, storage }, message.attachmentFileId);
    if (message.authorId !== user.id) {
      await recordAudit(db, {
        at: now(),
        actorUserId: user.id,
        action: 'group.chat_message_deleted',
        metadata: { groupId: access.group.id, authorId: message.authorId },
        ipAddress: context.ipAddress,
      });
    }
  }
  return oneMessage(db, access.group, user, access.role, message.id, now());
}

export async function setPinned(
  context: ChatContext,
  user: User,
  groupId: string,
  messageId: string,
  pinned: boolean,
): Promise<ChatMessage> {
  const { db, now } = context;
  const access = await groupAccess(db, user, groupId);
  assertCan(access, 'pin');
  assertNotArchived(access);
  const message = await findMessage(db, access.group.id, messageId);
  if (message.deletedAt) {
    throw new HttpError(409, 'MESSAGE_NOT_EDITABLE', 'A deleted message cannot be pinned');
  }
  if ((message.pinnedAt !== null) !== pinned) {
    await db
      .update(groupMessages)
      .set({ pinnedAt: pinned ? now() : null, version: nextVersion })
      .where(eq(groupMessages.id, message.id));
  }
  return oneMessage(db, access.group, user, access.role, message.id, now());
}

/** The staff mute or unmute a student; the student keeps reading. */
export async function setMemberMuted(
  context: ChatContext,
  user: User,
  groupId: string,
  studentId: string,
  muted: boolean,
): Promise<{ studentId: string; muted: boolean }> {
  const { db, now } = context;
  const access = await groupAccess(db, user, groupId);
  assertCan(access, 'mute');
  assertNotArchived(access);
  const [updated] = await db
    .update(groupMembers)
    .set({ chatMuted: muted })
    .where(
      and(
        eq(groupMembers.groupId, access.group.id),
        eq(groupMembers.studentId, studentId),
        eq(groupMembers.status, 'active'),
      ),
    )
    .returning({ studentId: groupMembers.studentId });
  if (!updated) {
    throw new HttpError(404, 'NOT_FOUND', 'Student not found in this group');
  }
  await recordAudit(db, {
    at: now(),
    actorUserId: user.id,
    action: muted ? 'group.chat_member_muted' : 'group.chat_member_unmuted',
    metadata: { groupId: access.group.id, studentId },
    ipAddress: context.ipAddress,
  });
  return { studentId, muted };
}

/** Unread messages per group for one person: others' messages after what they last read. */
export async function unreadCounts(
  db: Database,
  userId: string,
  groupIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (groupIds.length === 0) {
    return counts;
  }
  const rows = await db
    .select({ groupId: groupMessages.groupId, total: count() })
    .from(groupMessages)
    .leftJoin(
      chatReads,
      and(eq(chatReads.groupId, groupMessages.groupId), eq(chatReads.userId, userId)),
    )
    .where(
      and(
        inArray(groupMessages.groupId, groupIds),
        ne(groupMessages.authorId, userId),
        isNull(groupMessages.deletedAt),
        gt(groupMessages.seq, sql`coalesce(${chatReads.lastReadSeq}, 0)`),
      ),
    )
    .groupBy(groupMessages.groupId);
  for (const row of rows) {
    counts.set(row.groupId, row.total);
  }
  return counts;
}
