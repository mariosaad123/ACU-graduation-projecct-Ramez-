import { isStaff, type ChatMessage, type GroupRole, type Poll } from '@acu/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  doctorProfiles,
  files,
  groupMessages,
  pollOptions,
  polls,
  pollVotes,
  users,
  type Group,
  type GroupMessage,
  type User,
} from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { toAttachment } from '../files/files.service';
import { groupParticipants } from '../groups/access';
import { avatarUrlOf } from '../users/avatar';

export const nextVersion = sql`nextval('chat_version_seq')`;

const EXCERPT_LENGTH = 120;

/** @[uuid] names a person in a message; @[all] calls everyone in the group. */
export const MENTION = /@\[([0-9a-f-]{36}|all)\]/g;

/** The people named in a text, and whether it calls everyone. */
export function mentionsIn(text: string): { ids: string[]; all: boolean } {
  const ids = new Set<string>();
  let all = false;
  for (const match of text.matchAll(MENTION)) {
    const target = match[1] ?? '';
    if (target === 'all') {
      all = true;
    } else {
      ids.add(target);
    }
  }
  return { ids: [...ids], all };
}

/**
 * Keeps only mentions of people in the group, and @all only from someone allowed to call everyone.
 * Others are removed from the text, so a message never points at a stranger.
 */
export function cleanMentions(
  text: string,
  participants: ReadonlyMap<string, GroupRole>,
  mayMentionAll: boolean,
): { body: string; ids: string[]; all: boolean } {
  const body = text
    .replace(MENTION, (token, target: string) =>
      target === 'all' ? (mayMentionAll ? token : '') : participants.has(target) ? token : '',
    )
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return { body, ...mentionsIn(body) };
}

/** Plain text for excerpts and notifications: @[id] becomes @Name. */
export function plainText(
  text: string,
  names: ReadonlyMap<string, string>,
  everyone = '@all',
): string {
  return text.replace(MENTION, (_token, target: string) =>
    target === 'all' ? everyone : `@${names.get(target) ?? ''}`,
  );
}

/** Display names: a doctor's chosen name, otherwise the account's. */
export async function namesOf(db: Database, ids: string[]) {
  if (ids.length === 0) {
    return new Map<string, { name: string; avatarUrl: string | null }>();
  }
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      avatarFileId: users.avatarFileId,
      displayName: doctorProfiles.displayName,
    })
    .from(users)
    .leftJoin(doctorProfiles, eq(doctorProfiles.userId, users.id))
    .where(inArray(users.id, ids));
  return new Map(
    rows.map((row) => [row.id, { name: row.displayName ?? row.name, avatarUrl: avatarUrlOf(row) }]),
  );
}

async function pollsOf(
  db: Database,
  reader: User,
  readerRole: GroupRole,
  messageIds: string[],
  authorOf: Map<string, string>,
  now: Date,
): Promise<Map<string, Poll>> {
  const result = new Map<string, Poll>();
  if (messageIds.length === 0) {
    return result;
  }
  const pollRows = await db.select().from(polls).where(inArray(polls.messageId, messageIds));
  if (pollRows.length === 0) {
    return result;
  }
  const pollIds = pollRows.map((poll) => poll.id);
  const [options, votes] = await Promise.all([
    db
      .select()
      .from(pollOptions)
      .where(inArray(pollOptions.pollId, pollIds))
      .orderBy(asc(pollOptions.position)),
    db.select().from(pollVotes).where(inArray(pollVotes.pollId, pollIds)),
  ]);
  const voterNames = await namesOf(db, [...new Set(votes.map((vote) => vote.userId))]);

  for (const poll of pollRows) {
    const pollVotesHere = votes.filter((vote) => vote.pollId === poll.id);
    const closed = poll.closedAt !== null || (poll.closesAt !== null && poll.closesAt <= now);
    result.set(poll.messageId, {
      id: poll.id,
      question: poll.question,
      multiple: poll.multiple,
      anonymous: poll.anonymous,
      closesAt: poll.closesAt?.toISOString() ?? null,
      closed,
      options: options
        .filter((option) => option.pollId === poll.id)
        .map((option) => {
          const chosen = pollVotesHere.filter((vote) => vote.optionId === option.id);
          return {
            id: option.id,
            text: option.text,
            votes: chosen.length,
            voters: poll.anonymous
              ? []
              : chosen.map((vote) => ({
                  id: vote.userId,
                  name: voterNames.get(vote.userId)?.name ?? '',
                })),
          };
        }),
      voters: new Set(pollVotesHere.map((vote) => vote.userId)).size,
      myVotes: pollVotesHere
        .filter((vote) => vote.userId === reader.id)
        .map((vote) => vote.optionId),
      canClose: !closed && (authorOf.get(poll.messageId) === reader.id || isStaff(readerRole)),
    });
  }
  return result;
}

/** Turns stored messages into what a reader sees: authors, attachments, mentions, polls, replies. */
export async function toMessages(
  db: Database,
  group: Group,
  reader: User,
  readerRole: GroupRole,
  rows: GroupMessage[],
  now: Date,
): Promise<ChatMessage[]> {
  if (rows.length === 0) {
    return [];
  }
  const replyIds = rows.flatMap((row) => (row.replyToId ? [row.replyToId] : []));
  const replies =
    replyIds.length === 0
      ? []
      : await db.select().from(groupMessages).where(inArray(groupMessages.id, replyIds));

  const roles = await groupParticipants(db, group);
  const people = await namesOf(db, [
    ...new Set([
      ...rows.map((row) => row.authorId),
      ...replies.map((reply) => reply.authorId),
      ...rows.flatMap((row) => row.mentions),
      ...replies.flatMap((reply) => reply.mentions),
    ]),
  ]);
  const nameOf = (id: string) => people.get(id)?.name ?? '';
  const names = new Map([...people].map(([id, person]) => [id, person.name]));

  const fileIds = rows.flatMap((row) => (row.attachmentFileId ? [row.attachmentFileId] : []));
  const attachments =
    fileIds.length === 0 ? [] : await db.select().from(files).where(inArray(files.id, fileIds));
  const attachmentById = new Map(attachments.map((file) => [file.id, toAttachment(file)]));
  const replyById = new Map(replies.map((reply) => [reply.id, reply]));
  const pollByMessage = await pollsOf(
    db,
    reader,
    readerRole,
    rows.filter((row) => !row.deletedAt).map((row) => row.id),
    new Map(rows.map((row) => [row.id, row.authorId])),
    now,
  );

  return rows.map((row) => {
    const reply = row.replyToId ? replyById.get(row.replyToId) : undefined;
    const deleted = row.deletedAt !== null;
    const role = roles.get(row.authorId) ?? 'student';
    return {
      id: row.id,
      seq: row.seq,
      version: row.version,
      author: {
        id: row.authorId,
        name: nameOf(row.authorId),
        avatarUrl: people.get(row.authorId)?.avatarUrl ?? null,
        isDoctor: row.authorId === group.doctorId,
        role,
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
            excerpt:
              reply.deletedAt || !reply.body
                ? null
                : plainText(reply.body, names).slice(0, EXCERPT_LENGTH),
            hasAttachment: !reply.deletedAt && reply.attachmentFileId !== null,
          }
        : null,
      mentions: deleted ? [] : row.mentions.map((id) => ({ id, name: nameOf(id) })),
      mentionsAll: !deleted && row.mentionsAll,
      mentionsMe:
        !deleted &&
        row.authorId !== reader.id &&
        (row.mentions.includes(reader.id) || row.mentionsAll),
      poll: deleted ? null : (pollByMessage.get(row.id) ?? null),
      pinned: !deleted && row.pinnedAt !== null,
      edited: !deleted && row.editedAt !== null,
      deleted,
      mine: row.authorId === reader.id,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function findMessage(db: Database, groupId: string, messageId: string) {
  const [row] = await db
    .select()
    .from(groupMessages)
    .where(and(eq(groupMessages.id, messageId), eq(groupMessages.groupId, groupId)));
  if (!row) {
    throw new HttpError(404, 'NOT_FOUND', 'Message not found');
  }
  return row;
}

export async function oneMessage(
  db: Database,
  group: Group,
  reader: User,
  readerRole: GroupRole,
  id: string,
  now: Date,
): Promise<ChatMessage> {
  const row = await findMessage(db, group.id, id);
  const [message] = await toMessages(db, group, reader, readerRole, [row], now);
  if (!message) {
    throw new HttpError(404, 'NOT_FOUND', 'Message not found');
  }
  return message;
}
