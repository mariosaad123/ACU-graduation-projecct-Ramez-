import {
  ANNOUNCEMENT_MAX_ATTACHMENTS,
  isStaff,
  type Announcement,
  type AnnouncementReceipts,
} from '@acu/shared';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  announcementAttachments,
  announcementReads,
  announcements,
  files,
  groupMembers,
  type Announcement as AnnouncementRow,
  type User,
} from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { recordAudit } from '../audit/audit';
import type { ChatContext } from '../chat/chat.service';
import { notifyContext } from '../chat/chat.service';
import { namesOf } from '../chat/messages';
import { removeFile, saveUpload, toAttachment, type Upload } from '../files/files.service';
import {
  assertCan,
  assertNotArchived,
  groupAccess,
  groupParticipants,
  type GroupAccess,
} from '../groups/access';
import { markReadFor, notify } from '../notifications/notifications.service';

/** The group's active students: the audience whose reading is counted. */
async function audienceOf(db: Database, groupId: string): Promise<string[]> {
  const rows = await db
    .select({ id: groupMembers.studentId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, 'active')));
  return rows.map((row) => row.id);
}

function mayManage(access: GroupAccess, row: AnnouncementRow, user: User): boolean {
  return row.authorId === user.id || isStaff(access.role);
}

function maySeeReceipts(access: GroupAccess, row: AnnouncementRow, user: User): boolean {
  return row.authorId === user.id || isStaff(access.role);
}

async function toAnnouncements(
  db: Database,
  access: GroupAccess,
  user: User,
  rows: AnnouncementRow[],
): Promise<Announcement[]> {
  if (rows.length === 0) {
    return [];
  }
  const ids = rows.map((row) => row.id);
  const [attachmentRows, readRows, roles, audience] = await Promise.all([
    db
      .select({ announcementId: announcementAttachments.announcementId, file: files })
      .from(announcementAttachments)
      .innerJoin(files, eq(files.id, announcementAttachments.fileId))
      .where(inArray(announcementAttachments.announcementId, ids))
      .orderBy(asc(announcementAttachments.position)),
    db
      .select({
        announcementId: announcementReads.announcementId,
        userId: announcementReads.userId,
      })
      .from(announcementReads)
      .where(inArray(announcementReads.announcementId, ids)),
    groupParticipants(db, access.group),
    audienceOf(db, access.group.id),
  ]);
  const authors = await namesOf(db, [...new Set(rows.map((row) => row.authorId))]);
  const audienceSet = new Set(audience);

  return rows.map((row) => {
    const readers = readRows.filter((read) => read.announcementId === row.id);
    const counted = audience.filter((id) => id !== row.authorId);
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      important: row.important,
      author: {
        id: row.authorId,
        name: authors.get(row.authorId)?.name ?? '',
        avatarUrl: authors.get(row.authorId)?.avatarUrl ?? null,
        role: roles.get(row.authorId) ?? 'student',
      },
      attachments: attachmentRows
        .filter((attachment) => attachment.announcementId === row.id)
        .map((attachment) => toAttachment(attachment.file)),
      createdAt: row.createdAt.toISOString(),
      edited: row.editedAt !== null,
      read: row.authorId === user.id || readers.some((read) => read.userId === user.id),
      receipts: maySeeReceipts(access, row, user)
        ? {
            read: readers.filter(
              (read) => audienceSet.has(read.userId) && read.userId !== row.authorId,
            ).length,
            total: counted.length,
          }
        : null,
      canEdit: mayManage(access, row, user),
    };
  });
}

async function findAnnouncement(db: Database, groupId: string, id: string) {
  const [row] = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.id, id),
        eq(announcements.groupId, groupId),
        isNull(announcements.deletedAt),
      ),
    );
  if (!row) {
    throw new HttpError(404, 'NOT_FOUND', 'Announcement not found');
  }
  return row;
}

export async function listAnnouncements(
  context: ChatContext,
  user: User,
  groupId: string,
): Promise<Announcement[]> {
  const { db } = context;
  const access = await groupAccess(db, user, groupId);
  const rows = await db
    .select()
    .from(announcements)
    .where(and(eq(announcements.groupId, access.group.id), isNull(announcements.deletedAt)))
    .orderBy(desc(announcements.createdAt));
  return toAnnouncements(db, access, user, rows);
}

export async function createAnnouncement(
  context: ChatContext,
  user: User,
  groupId: string,
  input: { title: string; body: string; important: boolean },
  uploads: Upload[],
): Promise<Announcement> {
  const { db, storage, now } = context;
  const access = await groupAccess(db, user, groupId);
  assertCan(access, 'announce');
  assertNotArchived(access);
  if (uploads.length > ANNOUNCEMENT_MAX_ATTACHMENTS) {
    throw new HttpError(400, 'TOO_MANY_FILES', 'Too many files', {
      details: { maxCount: ANNOUNCEMENT_MAX_ATTACHMENTS },
    });
  }

  const saved = [];
  try {
    for (const upload of uploads) {
      saved.push(await saveUpload({ db, storage }, user, upload, 'chat', access.group.id));
    }
  } catch (error) {
    for (const file of saved) {
      await removeFile({ db, storage }, file.id);
    }
    throw error;
  }

  const [row] = await db
    .insert(announcements)
    .values({
      groupId: access.group.id,
      authorId: user.id,
      title: input.title,
      body: input.body,
      important: input.important,
      createdAt: now(),
    })
    .returning();
  if (!row) {
    throw new Error('Announcement was not created');
  }
  if (saved.length > 0) {
    await db
      .insert(announcementAttachments)
      .values(
        saved.map((file, position) => ({ announcementId: row.id, fileId: file.id, position })),
      );
  }

  const participants = await groupParticipants(db, access.group);
  const authorName = (await namesOf(db, [user.id])).get(user.id)?.name ?? user.name;
  await notify(notifyContext(context), {
    kind: 'announcement',
    groupId: access.group.id,
    groupName: access.group.name,
    actor: { id: user.id, name: authorName },
    recipients: [...participants.keys()],
    announcementId: row.id,
    excerpt: row.title,
  });
  const [announcement] = await toAnnouncements(db, access, user, [row]);
  if (!announcement) {
    throw new Error('Announcement was not created');
  }
  return announcement;
}

export async function editAnnouncement(
  context: ChatContext,
  user: User,
  groupId: string,
  id: string,
  changes: { title?: string; body?: string; important?: boolean },
): Promise<Announcement> {
  const { db, now } = context;
  const access = await groupAccess(db, user, groupId);
  assertNotArchived(access);
  const row = await findAnnouncement(db, access.group.id, id);
  if (!mayManage(access, row, user)) {
    throw new HttpError(403, 'FORBIDDEN', 'You cannot change this announcement');
  }
  const [updated] = await db
    .update(announcements)
    .set({ ...changes, editedAt: now() })
    .where(eq(announcements.id, row.id))
    .returning();
  const [announcement] = await toAnnouncements(db, access, user, [updated ?? row]);
  if (!announcement) {
    throw new Error('Announcement was not found after editing');
  }
  return announcement;
}

/** Deletes an announcement with its files. Deleting someone else's is audited. */
export async function deleteAnnouncement(
  context: ChatContext,
  user: User,
  groupId: string,
  id: string,
): Promise<void> {
  const { db, storage, now } = context;
  const access = await groupAccess(db, user, groupId);
  const row = await findAnnouncement(db, access.group.id, id);
  if (!mayManage(access, row, user)) {
    throw new HttpError(403, 'FORBIDDEN', 'You cannot delete this announcement');
  }
  const attachmentRows = await db
    .select({ fileId: announcementAttachments.fileId })
    .from(announcementAttachments)
    .where(eq(announcementAttachments.announcementId, row.id));
  await db.update(announcements).set({ deletedAt: now() }).where(eq(announcements.id, row.id));
  for (const attachment of attachmentRows) {
    await removeFile({ db, storage }, attachment.fileId);
  }
  if (row.authorId !== user.id) {
    await recordAudit(db, {
      at: now(),
      actorUserId: user.id,
      action: 'group.announcement_deleted',
      metadata: { groupId: access.group.id, authorId: row.authorId },
      ipAddress: context.ipAddress,
    });
  }
}

/** Seeing announcements records it once; later views keep the first time. */
export async function markAnnouncementsRead(
  context: ChatContext,
  user: User,
  groupId: string,
  ids: string[],
): Promise<void> {
  const { db, now } = context;
  const access = await groupAccess(db, user, groupId);
  const rows = await db
    .select({ id: announcements.id })
    .from(announcements)
    .where(
      and(
        inArray(announcements.id, ids),
        eq(announcements.groupId, access.group.id),
        isNull(announcements.deletedAt),
      ),
    );
  if (rows.length === 0) {
    return;
  }
  await db
    .insert(announcementReads)
    .values(rows.map((row) => ({ announcementId: row.id, userId: user.id, readAt: now() })))
    .onConflictDoNothing();
  for (const row of rows) {
    await markReadFor(db, user.id, { announcementId: row.id }, now());
  }
}

/** Who among the group's active students has seen an announcement, and who has not. */
export async function announcementReceipts(
  context: ChatContext,
  user: User,
  groupId: string,
  id: string,
): Promise<AnnouncementReceipts> {
  const { db } = context;
  const access = await groupAccess(db, user, groupId);
  const row = await findAnnouncement(db, access.group.id, id);
  if (!maySeeReceipts(access, row, user)) {
    throw new HttpError(403, 'FORBIDDEN', 'Only the staff and the author see who read it');
  }
  const audience = (await audienceOf(db, access.group.id)).filter((id) => id !== row.authorId);
  const reads = await db
    .select()
    .from(announcementReads)
    .where(eq(announcementReads.announcementId, row.id));
  const readAt = new Map(reads.map((read) => [read.userId, read.readAt]));
  const people = await namesOf(db, audience);
  const person = (id: string) => ({
    id,
    name: people.get(id)?.name ?? '',
    avatarUrl: people.get(id)?.avatarUrl ?? null,
  });
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

  return {
    read: audience
      .filter((id) => readAt.has(id))
      .map((id) => ({ ...person(id), readAt: readAt.get(id)?.toISOString() ?? '' }))
      .sort((a, b) => a.readAt.localeCompare(b.readAt)),
    unread: audience
      .filter((id) => !readAt.has(id))
      .map(person)
      .sort(byName),
  };
}
