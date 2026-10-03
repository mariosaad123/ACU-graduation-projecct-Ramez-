import type { AttachmentKind, GroupFile, GroupFilesResponse } from '@acu/shared';
import { and, desc, eq, ilike, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  announcementAttachments,
  assignmentAttachments,
  announcements,
  files,
  groupMessages,
  type User,
} from '../../db/schema';
import { namesOf } from '../chat/messages';
import { groupAccess } from '../groups/access';
import { toAttachment } from './files.service';

const PAGE_SIZE = 60;

function kindCondition(kind: AttachmentKind): SQL {
  switch (kind) {
    case 'image':
      return ilike(files.contentType, 'image/%');
    case 'video':
      return ilike(files.contentType, 'video/%');
    case 'audio':
      return ilike(files.contentType, 'audio/%');
    case 'document':
      return sql`${files.contentType} not similar to '(image|video|audio)/%'`;
  }
}

/** Escapes LIKE wildcards so a search for "50%" finds "50%", not everything. */
function likeTerm(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * Everything shared in a group, from its chat, its announcements and its assignments, newest first: what the files
 * tab lists, in four kinds. Files of deleted messages or announcements are gone with them.
 */
export async function groupFiles(
  db: Database,
  user: User,
  groupId: string,
  query: { kind: AttachmentKind; search: string | null; before: Date | null },
): Promise<GroupFilesResponse> {
  const { group } = await groupAccess(db, user, groupId);

  const shared = and(
    eq(files.groupId, group.id),
    eq(files.purpose, 'chat'),
    or(
      isNotNull(groupMessages.id),
      isNotNull(announcements.id),
      isNotNull(assignmentAttachments.assignmentId),
    ),
  );
  const base = () =>
    db
      .select({
        file: files,
        messageId: groupMessages.id,
        announcementId: announcements.id,
        assignmentId: assignmentAttachments.assignmentId,
      })
      .from(files)
      .leftJoin(
        groupMessages,
        and(eq(groupMessages.attachmentFileId, files.id), isNull(groupMessages.deletedAt)),
      )
      .leftJoin(announcementAttachments, eq(announcementAttachments.fileId, files.id))
      .leftJoin(
        announcements,
        and(
          eq(announcements.id, announcementAttachments.announcementId),
          isNull(announcements.deletedAt),
        ),
      )
      .leftJoin(assignmentAttachments, eq(assignmentAttachments.fileId, files.id));

  const rows = await base()
    .where(
      and(
        shared,
        kindCondition(query.kind),
        query.search ? ilike(files.originalName, likeTerm(query.search)) : undefined,
        query.before ? lt(files.createdAt, query.before) : undefined,
      ),
    )
    .orderBy(desc(files.createdAt))
    .limit(PAGE_SIZE + 1);

  const [counts] = await db
    .select({
      image: sql`count(*) filter (where ${files.contentType} like 'image/%')`.mapWith(Number),
      video: sql`count(*) filter (where ${files.contentType} like 'video/%')`.mapWith(Number),
      audio: sql`count(*) filter (where ${files.contentType} like 'audio/%')`.mapWith(Number),
      document:
        sql`count(*) filter (where ${files.contentType} not similar to '(image|video|audio)/%')`.mapWith(
          Number,
        ),
    })
    .from(files)
    .leftJoin(
      groupMessages,
      and(eq(groupMessages.attachmentFileId, files.id), isNull(groupMessages.deletedAt)),
    )
    .leftJoin(announcementAttachments, eq(announcementAttachments.fileId, files.id))
    .leftJoin(
      announcements,
      and(
        eq(announcements.id, announcementAttachments.announcementId),
        isNull(announcements.deletedAt),
      ),
    )
    .leftJoin(assignmentAttachments, eq(assignmentAttachments.fileId, files.id))
    .where(shared);

  const page = rows.slice(0, PAGE_SIZE);
  const authors = await namesOf(db, [...new Set(page.map((row) => row.file.ownerId))]);
  const list: GroupFile[] = page.map((row) => ({
    attachment: toAttachment(row.file),
    author: { id: row.file.ownerId, name: authors.get(row.file.ownerId)?.name ?? '' },
    source: row.messageId ? 'chat' : row.announcementId ? 'announcement' : 'assignment',
    sourceId: row.messageId ?? row.announcementId ?? row.assignmentId ?? '',
    createdAt: row.file.createdAt.toISOString(),
  }));

  return {
    files: list,
    counts: counts ?? { image: 0, video: 0, audio: 0, document: 0 },
    hasMore: rows.length > PAGE_SIZE,
  };
}
