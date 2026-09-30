import {
  CHAT_MESSAGE_MAX_LENGTH,
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
  chatReads,
  doctorProfiles,
  files,
  groupMembers,
  groupMessages,
  groups,
  users,
  type Group,
  type GroupMessage,
  type User,
} from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { recordAudit } from '../audit/audit';
import { fileUrl, removeFile, saveUpload, toAttachment, type Upload } from '../files/files.service';
import type { FileStorage } from '../files/storage';
import { avatarUrlOf } from '../users/avatar';

export interface ChatContext {
  db: Database;
  storage: FileStorage;
  now: () => Date;
  ipAddress: string | undefined;
}

const PAGE_SIZE = 50;
const CHANGES_LIMIT = 200;
/** Messages one person may send to a group in a minute, so nobody can flood it. */
export const MESSAGES_PER_MINUTE = 20;
const EXCERPT_LENGTH = 120;

const nextVersion = sql`nextval('chat_version_seq')`;

interface Access {
  group: Group;
  isDoctor: boolean;
  muted: boolean;
}

/**
 * The group's doctor and its active members may use its chat. Anyone else, including students
 * waiting for approval or removed from it, gets the same answer as for a group that does not exist.
 */
async function accessOf(db: Database, user: User, groupId: string): Promise<Access> {
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (group?.doctorId === user.id) {
    return { group, isDoctor: true, muted: false };
  }
  if (group && user.role === 'student') {
    const [membership] = await db
      .select({ chatMuted: groupMembers.chatMuted })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, group.id),
          eq(groupMembers.studentId, user.id),
          eq(groupMembers.status, 'active'),
        ),
      );
    if (membership) {
      return { group, isDoctor: false, muted: membership.chatMuted };
    }
  }
  throw new HttpError(404, 'NOT_FOUND', 'Group not found');
}

function canPost(access: Access): boolean {
  if (access.group.archivedAt) {
    return false;
  }
  return access.isDoctor || (access.group.chatOpen && !access.muted);
}

function assertCanPost(access: Access): void {
  if (access.group.archivedAt) {
    throw new HttpError(409, 'GROUP_ARCHIVED', 'This group is archived');
  }
  if (!access.isDoctor && !access.group.chatOpen) {
    throw new HttpError(403, 'CHAT_CLOSED', 'Only the doctor writes in this chat now');
  }
  if (!access.isDoctor && access.muted) {
    throw new HttpError(403, 'CHAT_MUTED', 'The doctor muted you in this chat');
  }
}

async function lastReadSeq(db: Database, groupId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ seq: chatReads.lastReadSeq })
    .from(chatReads)
    .where(and(eq(chatReads.groupId, groupId), eq(chatReads.userId, userId)));
  return row?.seq ?? 0;
}

export async function groupView(
  context: ChatContext,
  user: User,
  groupId: string,
): Promise<GroupView> {
  const access = await accessOf(context.db, user, groupId);
  const { group } = access;
  const [doctor] = await context.db
    .select({
      displayName: doctorProfiles.displayName,
      avatarUrl: users.avatarUrl,
      avatarFileId: users.avatarFileId,
    })
    .from(users)
    .innerJoin(doctorProfiles, eq(doctorProfiles.userId, users.id))
    .where(eq(users.id, group.doctorId));

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    language: group.language,
    photoUrl: group.photoFileId ? fileUrl(group.photoFileId) : null,
    archived: group.archivedAt !== null,
    doctor: {
      name: doctor?.displayName ?? '',
      avatarUrl: doctor ? avatarUrlOf(doctor) : null,
    },
    isDoctor: access.isDoctor,
    chat: {
      open: group.chatOpen,
      muted: access.muted,
      canPost: canPost(access),
      lastReadSeq: await lastReadSeq(context.db, group.id, user.id),
    },
  };
}

/** Turns stored messages into what a reader sees: authors, attachments and quoted replies. */
async function toMessages(
  db: Database,
  group: Group,
  reader: User,
  rows: GroupMessage[],
): Promise<ChatMessage[]> {
  if (rows.length === 0) {
    return [];
  }
  const replyIds = rows.flatMap((row) => (row.replyToId ? [row.replyToId] : []));
  const replies =
    replyIds.length === 0
      ? []
      : await db.select().from(groupMessages).where(inArray(groupMessages.id, replyIds));

  const authorIds = [...new Set([...rows, ...replies].map((row) => row.authorId))];
  const authors = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      avatarFileId: users.avatarFileId,
      displayName: doctorProfiles.displayName,
    })
    .from(users)
    .leftJoin(doctorProfiles, eq(doctorProfiles.userId, users.id))
    .where(inArray(users.id, authorIds));
  const authorById = new Map(authors.map((author) => [author.id, author]));
  const nameOf = (id: string) => {
    const author = authorById.get(id);
    return (id === group.doctorId ? author?.displayName : author?.name) ?? author?.name ?? '';
  };

  const fileIds = rows.flatMap((row) => (row.attachmentFileId ? [row.attachmentFileId] : []));
  const attachments =
    fileIds.length === 0 ? [] : await db.select().from(files).where(inArray(files.id, fileIds));
  const attachmentById = new Map(attachments.map((file) => [file.id, toAttachment(file)]));
  const replyById = new Map(replies.map((reply) => [reply.id, reply]));

  return rows.map((row) => {
    const author = authorById.get(row.authorId);
    const reply = row.replyToId ? replyById.get(row.replyToId) : undefined;
    const deleted = row.deletedAt !== null;
    return {
      id: row.id,
      seq: row.seq,
      version: row.version,
      author: {
        id: row.authorId,
        name: nameOf(row.authorId),
        avatarUrl: author ? avatarUrlOf(author) : null,
        isDoctor: row.authorId === group.doctorId,
      },
      body: deleted ? null : row.body,
      attachment:
        deleted || !row.attachmentFileId
          ? null
          : (attachmentById.get(row.attachmentFileId) ?? null),
      replyTo: reply
        ? {
            id: reply.id,
            authorName: nameOf(reply.authorId),
            excerpt: reply.deletedAt ? null : (reply.body?.slice(0, EXCERPT_LENGTH) ?? null),
            hasAttachment: !reply.deletedAt && reply.attachmentFileId !== null,
          }
        : null,
      pinned: !deleted && row.pinnedAt !== null,
      edited: !deleted && row.editedAt !== null,
      deleted,
      mine: row.authorId === reader.id,
      createdAt: row.createdAt.toISOString(),
    };
  });
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
  const { group } = await accessOf(db, user, groupId);
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
    messages: await toMessages(db, group, user, page),
    pinned: await toMessages(db, group, user, pinned),
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
  const { group } = await accessOf(db, user, groupId);
  const rows = await db
    .select()
    .from(groupMessages)
    .where(and(eq(groupMessages.groupId, group.id), gt(groupMessages.version, sinceVersion)))
    .orderBy(asc(groupMessages.version))
    .limit(CHANGES_LIMIT);
  const last = rows.at(-1);
  return {
    messages: await toMessages(db, group, user, rows),
    version: last ? last.version : sinceVersion,
  };
}

async function oneMessage(
  db: Database,
  group: Group,
  reader: User,
  id: string,
): Promise<ChatMessage> {
  const [row] = await db
    .select()
    .from(groupMessages)
    .where(and(eq(groupMessages.id, id), eq(groupMessages.groupId, group.id)));
  const [message] = row ? await toMessages(db, group, reader, [row]) : [];
  if (!message) {
    throw new HttpError(404, 'NOT_FOUND', 'Message not found');
  }
  return message;
}

async function findMessage(db: Database, groupId: string, messageId: string) {
  const [row] = await db
    .select()
    .from(groupMessages)
    .where(and(eq(groupMessages.id, messageId), eq(groupMessages.groupId, groupId)));
  if (!row) {
    throw new HttpError(404, 'NOT_FOUND', 'Message not found');
  }
  return row;
}

async function markRead(db: Database, groupId: string, userId: string, seq: number): Promise<void> {
  await db
    .insert(chatReads)
    .values({ groupId, userId, lastReadSeq: seq })
    .onConflictDoUpdate({
      target: [chatReads.groupId, chatReads.userId],
      // Reading never moves backwards, whatever order the requests arrive in.
      set: { lastReadSeq: sql`greatest(${chatReads.lastReadSeq}, ${seq})` },
    });
}

export async function markChatRead(
  context: ChatContext,
  user: User,
  groupId: string,
  seq: number,
): Promise<void> {
  const { group } = await accessOf(context.db, user, groupId);
  await markRead(context.db, group.id, user.id, seq);
}

export async function postMessage(
  context: ChatContext,
  user: User,
  groupId: string,
  input: { body: string; replyToId: string | null },
  upload: Upload | null,
): Promise<ChatMessage> {
  const { db, storage, now } = context;
  const access = await accessOf(db, user, groupId);
  assertCanPost(access);
  const { group } = access;

  const body = input.body.trim();
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

  const since = new Date(now().getTime() - 60 * 1000);
  const [recent] = await db
    .select({ total: count() })
    .from(groupMessages)
    .where(
      and(
        eq(groupMessages.groupId, group.id),
        eq(groupMessages.authorId, user.id),
        gte(groupMessages.createdAt, since),
      ),
    );
  if ((recent?.total ?? 0) >= MESSAGES_PER_MINUTE) {
    throw new HttpError(429, 'RATE_LIMITED', 'Too many messages, wait a moment');
  }

  if (input.replyToId) {
    await findMessage(db, group.id, input.replyToId);
  }

  const attachment = upload
    ? await saveUpload({ db, storage }, user, upload, 'chat', group.id)
    : null;
  try {
    const [created] = await db
      .insert(groupMessages)
      .values({
        groupId: group.id,
        authorId: user.id,
        body: body || null,
        attachmentFileId: attachment?.id ?? null,
        replyToId: input.replyToId,
        createdAt: now(),
      })
      .returning();
    if (!created) {
      throw new Error('Message was not created');
    }
    // Writing a message means having read everything up to it.
    await markRead(db, group.id, user.id, created.seq);
    return await oneMessage(db, group, user, created.id);
  } catch (error) {
    await removeFile({ db, storage }, attachment?.id ?? null);
    throw error;
  }
}

export async function editMessage(
  context: ChatContext,
  user: User,
  groupId: string,
  messageId: string,
  body: string,
): Promise<ChatMessage> {
  const { db, now } = context;
  const access = await accessOf(db, user, groupId);
  assertCanPost(access);
  const message = await findMessage(db, access.group.id, messageId);
  if (message.authorId !== user.id || message.deletedAt || message.body === null) {
    throw new HttpError(403, 'MESSAGE_NOT_EDITABLE', 'Only your own text messages can be edited');
  }
  await db
    .update(groupMessages)
    .set({ body, editedAt: now(), version: nextVersion })
    .where(eq(groupMessages.id, message.id));
  return oneMessage(db, access.group, user, message.id);
}

/**
 * Deletes a message for everyone: its text and attachment are gone and it shows as deleted. The
 * author can delete their own; the doctor can delete any, and that is audited.
 */
export async function deleteMessage(
  context: ChatContext,
  user: User,
  groupId: string,
  messageId: string,
): Promise<ChatMessage> {
  const { db, storage, now } = context;
  const access = await accessOf(db, user, groupId);
  const message = await findMessage(db, access.group.id, messageId);
  if (message.authorId !== user.id && !access.isDoctor) {
    throw new HttpError(403, 'FORBIDDEN', 'You cannot delete this message');
  }
  if (!message.deletedAt) {
    await db
      .update(groupMessages)
      .set({
        body: null,
        attachmentFileId: null,
        pinnedAt: null,
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
  return oneMessage(db, access.group, user, message.id);
}

export async function setPinned(
  context: ChatContext,
  user: User,
  groupId: string,
  messageId: string,
  pinned: boolean,
): Promise<ChatMessage> {
  const { db, now } = context;
  const access = await accessOf(db, user, groupId);
  if (!access.isDoctor) {
    throw new HttpError(403, 'FORBIDDEN', 'Only the doctor pins messages');
  }
  if (access.group.archivedAt) {
    throw new HttpError(409, 'GROUP_ARCHIVED', 'This group is archived');
  }
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
  return oneMessage(db, access.group, user, message.id);
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
