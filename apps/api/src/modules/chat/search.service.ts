import {
  CHAT_SEARCH_MIN_LENGTH,
  isStaff,
  type ChatSearchFilter,
  type ChatSearchResponse,
} from '@acu/shared';
import { and, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { files, groupMessages, type User } from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { groupAccess, groupParticipants } from '../groups/access';
import type { ChatContext } from './chat.service';
import { toMessages } from './messages';

const PAGE_SIZE = 30;

/** Escapes LIKE wildcards so a search for "50%" finds "50%", not everything. */
function likeTerm(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * Finds messages in a group's chat, newest first: by words in the text or in an attached file's
 * name, narrowed to what the staff wrote, what is pinned, where the reader is mentioned, or what
 * carries a file. A filter alone lists everything it covers.
 */
export async function searchChat(
  context: ChatContext,
  user: User,
  groupId: string,
  query: { text: string; filter: ChatSearchFilter; beforeSeq: number | null },
): Promise<ChatSearchResponse> {
  const { db } = context;
  const access = await groupAccess(db, user, groupId);
  const text = query.text.trim();
  if (text.length < CHAT_SEARCH_MIN_LENGTH && query.filter === 'all') {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Write at least two characters', {
      fields: { q: 'too_short' },
    });
  }

  let narrowed;
  switch (query.filter) {
    case 'staff': {
      const roles = await groupParticipants(db, access.group);
      const staff = [...roles].filter(([, role]) => isStaff(role)).map(([id]) => id);
      narrowed = inArray(groupMessages.authorId, staff);
      break;
    }
    case 'pinned':
      narrowed = isNotNull(groupMessages.pinnedAt);
      break;
    case 'mentions':
      narrowed = or(
        sql`${user.id} = any(${groupMessages.mentions})`,
        eq(groupMessages.mentionsAll, true),
      );
      break;
    case 'files':
      narrowed = isNotNull(groupMessages.attachmentFileId);
      break;
    case 'all':
      narrowed = undefined;
  }

  const term = likeTerm(text);
  const rows = await db
    .select({ message: groupMessages })
    .from(groupMessages)
    .leftJoin(files, eq(files.id, groupMessages.attachmentFileId))
    .where(
      and(
        eq(groupMessages.groupId, access.group.id),
        isNull(groupMessages.deletedAt),
        narrowed,
        text.length >= CHAT_SEARCH_MIN_LENGTH
          ? or(ilike(groupMessages.body, term), ilike(files.originalName, term))
          : undefined,
        query.beforeSeq === null ? undefined : lt(groupMessages.seq, query.beforeSeq),
      ),
    )
    .orderBy(desc(groupMessages.seq))
    .limit(PAGE_SIZE + 1);

  const page = rows.slice(0, PAGE_SIZE).map((row) => row.message);
  return {
    messages: await toMessages(db, access.group, user, access.role, page, context.now()),
    hasMore: rows.length > PAGE_SIZE,
  };
}
