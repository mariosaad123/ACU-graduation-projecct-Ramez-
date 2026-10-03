import { isStaff, type ChatMessage, type CreatePollRequest } from '@acu/shared';
import { and, eq } from 'drizzle-orm';
import { groupMessages, pollOptions, polls, pollVotes, type User } from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { assertCan, assertNotArchived, groupAccess, groupParticipants } from '../groups/access';
import { notify } from '../notifications/notifications.service';
import { assertWithinRate, markRead, notifyContext, type ChatContext } from './chat.service';
import { namesOf, nextVersion, oneMessage } from './messages';

async function findPoll(context: ChatContext, groupId: string, pollId: string) {
  const [poll] = await context.db
    .select()
    .from(polls)
    .where(and(eq(polls.id, pollId), eq(polls.groupId, groupId)));
  if (!poll) {
    throw new HttpError(404, 'NOT_FOUND', 'Poll not found');
  }
  const [message] = await context.db
    .select()
    .from(groupMessages)
    .where(eq(groupMessages.id, poll.messageId));
  if (!message || message.deletedAt) {
    throw new HttpError(404, 'NOT_FOUND', 'Poll not found');
  }
  return { poll, message };
}

/** Asks the group a question: a chat message carrying the poll, announced to everyone. */
export async function createPoll(
  context: ChatContext,
  user: User,
  groupId: string,
  input: CreatePollRequest,
): Promise<ChatMessage> {
  const { db, now } = context;
  const access = await groupAccess(db, user, groupId);
  assertCan(access, 'createPolls');
  assertNotArchived(access);
  if (access.muted) {
    throw new HttpError(403, 'CHAT_MUTED', 'You were muted in this chat');
  }
  const closesAt = input.closesAt ? new Date(input.closesAt) : null;
  if (closesAt && closesAt <= now()) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'The closing time has passed', {
      fields: { closesAt: 'past' },
    });
  }
  await assertWithinRate(db, access, user, now());

  const created = await db.transaction(async (tx) => {
    const [message] = await tx
      .insert(groupMessages)
      .values({ groupId: access.group.id, authorId: user.id, body: null, createdAt: now() })
      .returning();
    if (!message) {
      throw new Error('Poll message was not created');
    }
    const [poll] = await tx
      .insert(polls)
      .values({
        groupId: access.group.id,
        messageId: message.id,
        question: input.question,
        multiple: input.multiple,
        anonymous: input.anonymous,
        closesAt,
        createdAt: now(),
      })
      .returning();
    if (!poll) {
      throw new Error('Poll was not created');
    }
    await tx
      .insert(pollOptions)
      .values(input.options.map((text, position) => ({ pollId: poll.id, text, position })));
    return message;
  });

  await markRead(db, access.group.id, user.id, created.seq, now());
  const participants = await groupParticipants(db, access.group);
  const authorName = (await namesOf(db, [user.id])).get(user.id)?.name ?? user.name;
  await notify(notifyContext(context), {
    kind: 'poll',
    groupId: access.group.id,
    groupName: access.group.name,
    actor: { id: user.id, name: authorName },
    recipients: [...participants.keys()],
    messageId: created.id,
    excerpt: input.question,
  });
  return oneMessage(db, access.group, user, access.role, created.id, now());
}

/**
 * Records someone's choice, replacing any earlier one; an empty choice takes the vote back. Muted
 * students still vote: voting is not writing.
 */
export async function votePoll(
  context: ChatContext,
  user: User,
  groupId: string,
  pollId: string,
  optionIds: string[],
): Promise<ChatMessage> {
  const { db, now } = context;
  const access = await groupAccess(db, user, groupId);
  assertNotArchived(access);
  const { poll, message } = await findPoll(context, access.group.id, pollId);
  if (poll.closedAt || (poll.closesAt && poll.closesAt <= now())) {
    throw new HttpError(409, 'POLL_CLOSED', 'This poll is closed');
  }
  const chosen = [...new Set(optionIds)];
  if (!poll.multiple && chosen.length > 1) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Choose one option', {
      fields: { optionIds: 'single' },
    });
  }
  const options = await db
    .select({ id: pollOptions.id })
    .from(pollOptions)
    .where(eq(pollOptions.pollId, poll.id));
  const valid = new Set(options.map((option) => option.id));
  if (chosen.some((id) => !valid.has(id))) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Not an option of this poll', {
      fields: { optionIds: 'unknown' },
    });
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(pollVotes)
      .where(and(eq(pollVotes.pollId, poll.id), eq(pollVotes.userId, user.id)));
    if (chosen.length > 0) {
      await tx.insert(pollVotes).values(
        chosen.map((optionId) => ({
          pollId: poll.id,
          optionId,
          userId: user.id,
          votedAt: now(),
        })),
      );
    }
    // Everyone's open chat picks up the new results at its next poll for changes.
    await tx
      .update(groupMessages)
      .set({ version: nextVersion })
      .where(eq(groupMessages.id, message.id));
  });
  return oneMessage(db, access.group, user, access.role, message.id, now());
}

/** Ends voting early: its author or the group's staff. */
export async function closePoll(
  context: ChatContext,
  user: User,
  groupId: string,
  pollId: string,
): Promise<ChatMessage> {
  const { db, now } = context;
  const access = await groupAccess(db, user, groupId);
  const { poll, message } = await findPoll(context, access.group.id, pollId);
  if (message.authorId !== user.id && !isStaff(access.role)) {
    throw new HttpError(403, 'FORBIDDEN', 'Only its author or the staff close a poll');
  }
  if (!poll.closedAt) {
    await db.update(polls).set({ closedAt: now() }).where(eq(polls.id, poll.id));
    await db
      .update(groupMessages)
      .set({ version: nextVersion })
      .where(eq(groupMessages.id, message.id));
  }
  return oneMessage(db, access.group, user, access.role, message.id, now());
}
