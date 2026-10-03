import type { ChatMessage, MessageReactions } from '@acu/shared';
import { and, asc, eq } from 'drizzle-orm';
import { groupMessages, messageReactions, type User } from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { assertNotArchived, groupAccess } from '../groups/access';
import type { ChatContext } from './chat.service';
import { findMessage, namesOf, nextVersion, oneMessage } from './messages';

/**
 * Puts someone's reaction on a message, replaces it, or (with null) takes it back. Anyone in the
 * group may react, muted or not, whether the chat is open or closed: a reaction is not a message.
 */
export async function setReaction(
  context: ChatContext,
  user: User,
  groupId: string,
  messageId: string,
  emoji: string | null,
): Promise<ChatMessage> {
  const { db, now } = context;
  const access = await groupAccess(db, user, groupId);
  assertNotArchived(access);
  const message = await findMessage(db, access.group.id, messageId);
  if (message.deletedAt) {
    throw new HttpError(409, 'MESSAGE_NOT_EDITABLE', 'A deleted message takes no reactions');
  }

  await db.transaction(async (tx) => {
    if (emoji === null) {
      await tx
        .delete(messageReactions)
        .where(
          and(eq(messageReactions.messageId, message.id), eq(messageReactions.userId, user.id)),
        );
    } else {
      await tx
        .insert(messageReactions)
        .values({ messageId: message.id, userId: user.id, emoji, reactedAt: now() })
        .onConflictDoUpdate({
          target: [messageReactions.messageId, messageReactions.userId],
          set: { emoji, reactedAt: now() },
        });
    }
    // The change feed carries the new counts to everyone reading the chat.
    await tx
      .update(groupMessages)
      .set({ version: nextVersion })
      .where(eq(groupMessages.id, message.id));
  });
  return oneMessage(db, access.group, user, access.role, message.id, now());
}

/** Who reacted to a message, emoji by emoji, in the order they reacted. */
export async function reactionsOf(
  context: ChatContext,
  user: User,
  groupId: string,
  messageId: string,
): Promise<MessageReactions> {
  const { db } = context;
  const access = await groupAccess(db, user, groupId);
  const message = await findMessage(db, access.group.id, messageId);
  const rows = await db
    .select({ userId: messageReactions.userId, emoji: messageReactions.emoji })
    .from(messageReactions)
    .where(eq(messageReactions.messageId, message.id))
    .orderBy(asc(messageReactions.reactedAt));
  const people = await namesOf(db, [...new Set(rows.map((row) => row.userId))]);

  const byEmoji = new Map<string, MessageReactions['reactions'][number]['people']>();
  for (const row of rows) {
    const list = byEmoji.get(row.emoji) ?? [];
    list.push({
      id: row.userId,
      name: people.get(row.userId)?.name ?? '',
      avatarUrl: people.get(row.userId)?.avatarUrl ?? null,
    });
    byEmoji.set(row.emoji, list);
  }
  return {
    reactions: [...byEmoji]
      .map(([emoji, list]) => ({ emoji, people: list }))
      .sort((a, b) => b.people.length - a.people.length),
  };
}
