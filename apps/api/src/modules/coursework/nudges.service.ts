import { NUDGE_COOLDOWN_HOURS, type NudgeRequest, type NudgeResponse } from '@acu/shared';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import {
  announcements,
  assignments,
  groupMembers,
  notifications,
  type User,
} from '../../db/schema';
import { HttpError } from '../../http/http-error';
import type { ChatContext } from '../chat/chat.service';
import { notifyContext } from '../chat/chat.service';
import { namesOf } from '../chat/messages';
import { assertCan, assertNotArchived, groupAccess } from '../groups/access';
import { notify } from '../notifications/notifications.service';

/**
 * Reminds students of a group, from its staff: those gone quiet, those who have not read an
 * announcement, or those who have not handed in an assignment. A student already reminded in the
 * last hours is left alone, so a reminder stays something worth reading.
 */
export async function nudgeStudents(
  context: ChatContext,
  user: User,
  groupId: string,
  request: NudgeRequest,
): Promise<NudgeResponse> {
  const { db, now } = context;
  const access = await groupAccess(db, user, groupId);
  assertCan(access, 'teach');
  assertNotArchived(access);

  if (request.reason !== 'inactive' && !request.targetId) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Say what the reminder is about', {
      fields: { targetId: 'required' },
    });
  }
  if (request.reason === 'announcement' && request.targetId) {
    const [announcement] = await db
      .select({ id: announcements.id })
      .from(announcements)
      .where(
        and(
          eq(announcements.id, request.targetId),
          eq(announcements.groupId, access.group.id),
          isNull(announcements.deletedAt),
        ),
      );
    if (!announcement) {
      throw new HttpError(404, 'NOT_FOUND', 'Announcement not found');
    }
  }
  if (request.reason === 'assignment' && request.targetId) {
    const [assignment] = await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(and(eq(assignments.id, request.targetId), eq(assignments.groupId, access.group.id)));
    if (!assignment) {
      throw new HttpError(404, 'NOT_FOUND', 'Assignment not found');
    }
  }

  const wanted = [...new Set(request.studentIds)];
  const members = await db
    .select({ id: groupMembers.studentId })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, access.group.id),
        eq(groupMembers.status, 'active'),
        inArray(groupMembers.studentId, wanted),
      ),
    );
  if (members.length === 0) {
    throw new HttpError(404, 'STUDENT_NOT_FOUND', 'Student not found in this group');
  }

  const since = new Date(now().getTime() - NUDGE_COOLDOWN_HOURS * 60 * 60 * 1000);
  const recent = await db
    .select({ userId: notifications.userId })
    .from(notifications)
    .where(
      and(
        eq(notifications.groupId, access.group.id),
        eq(notifications.kind, 'nudge'),
        gt(notifications.createdAt, since),
        inArray(
          notifications.userId,
          members.map((member) => member.id),
        ),
      ),
    );
  const reminded = new Set(recent.map((row) => row.userId));
  const recipients = members.map((member) => member.id).filter((id) => !reminded.has(id));

  if (recipients.length > 0) {
    const actorName = (await namesOf(db, [user.id])).get(user.id)?.name ?? user.name;
    await notify(notifyContext(context), {
      kind: 'nudge',
      groupId: access.group.id,
      groupName: access.group.name,
      actor: { id: user.id, name: actorName },
      recipients,
      announcementId: request.reason === 'announcement' ? request.targetId : undefined,
      assignmentId: request.reason === 'assignment' ? request.targetId : undefined,
      // Without a note the reader's own language says why, from this key.
      excerpt: request.note?.length ? request.note : `nudge:${request.reason}`,
    });
  }
  return { sent: recipients.length, skipped: members.length - recipients.length };
}
