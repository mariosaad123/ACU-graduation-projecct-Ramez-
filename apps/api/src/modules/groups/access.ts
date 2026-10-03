import {
  CAPABILITIES,
  isWithinSchedule,
  nextScheduleChange,
  type GroupCapabilities,
  type GroupRole,
} from '@acu/shared';
import { and, eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../db/client';
import { groupAssistants, groupMembers, groups, type Group, type User } from '../../db/schema';
import { HttpError } from '../../http/http-error';

export interface GroupAccess {
  group: Group;
  role: GroupRole;
  can: GroupCapabilities;
  /** Muted by the staff: reads the chat, does not write in it. */
  muted: boolean;
}

function notFound(): HttpError {
  return new HttpError(404, 'NOT_FOUND', 'Group not found');
}

/**
 * Someone's place in a group: its doctor, one of its teaching assistants, or an active member with
 * their role. Anyone else, including students waiting for approval or removed, gets the same
 * answer as for a group that does not exist.
 */
export async function groupAccess(
  db: Database | Transaction,
  user: User,
  groupId: string,
): Promise<GroupAccess> {
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!group) {
    throw notFound();
  }
  const access = (role: GroupRole, muted = false): GroupAccess => ({
    group,
    role,
    can: CAPABILITIES[role],
    muted,
  });

  if (group.doctorId === user.id) {
    return access('owner');
  }
  if (user.role === 'doctor') {
    const [assistant] = await db
      .select({ userId: groupAssistants.userId })
      .from(groupAssistants)
      .where(and(eq(groupAssistants.groupId, group.id), eq(groupAssistants.userId, user.id)));
    if (assistant) {
      return access('assistant');
    }
  }
  if (user.role === 'student') {
    const [membership] = await db
      .select({ role: groupMembers.role, chatMuted: groupMembers.chatMuted })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, group.id),
          eq(groupMembers.studentId, user.id),
          eq(groupMembers.status, 'active'),
        ),
      );
    if (membership) {
      return access(membership.role, membership.chatMuted);
    }
  }
  throw notFound();
}

/** Throws unless the person may do this in the group. */
export function assertCan(access: GroupAccess, capability: keyof GroupCapabilities): void {
  if (!access.can[capability]) {
    throw new HttpError(403, 'FORBIDDEN', 'You cannot do this in this group');
  }
}

/** An archived group is read-only until it is restored. */
export function assertNotArchived(access: GroupAccess): void {
  if (access.group.archivedAt) {
    throw new HttpError(409, 'GROUP_ARCHIVED', 'This group is archived');
  }
}

/** Everyone taking part in a group now, with their role: the doctor, assistants, active members. */
export async function groupParticipants(
  db: Database | Transaction,
  group: Group,
): Promise<Map<string, GroupRole>> {
  const [assistants, members] = await Promise.all([
    db
      .select({ userId: groupAssistants.userId })
      .from(groupAssistants)
      .where(eq(groupAssistants.groupId, group.id)),
    db
      .select({ userId: groupMembers.studentId, role: groupMembers.role })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.status, 'active'))),
  ]);
  const roles = new Map<string, GroupRole>([[group.doctorId, 'owner']]);
  for (const assistant of assistants) {
    roles.set(assistant.userId, 'assistant');
  }
  for (const member of members) {
    roles.set(member.userId, member.role);
  }
  return roles;
}

/** Whether students may write now: by the doctor's switch, or by the weekly schedule if one is set. */
export function chatOpenNow(group: Group, now: Date): boolean {
  if (!group.chatSchedule) {
    return group.chatOpen;
  }
  return manualOverride(group, now) ?? isWithinSchedule(group.chatSchedule, now);
}

/** The doctor's by-hand choice while a schedule is set, if it still holds; otherwise null. */
export function manualOverride(group: Group, now: Date): boolean | null {
  const active =
    group.chatSchedule !== null &&
    group.chatOverrideOpen !== null &&
    group.chatOverrideUntil !== null &&
    now < group.chatOverrideUntil;
  return active ? group.chatOverrideOpen : null;
}

/** When the chat next opens or closes: after a by-hand choice ends, the schedule decides again. */
export function nextChatChange(group: Group, now: Date): { at: Date; opens: boolean } | null {
  const schedule = group.chatSchedule;
  if (!schedule) {
    return null;
  }
  const override = manualOverride(group, now);
  if (override === null || !group.chatOverrideUntil) {
    return nextScheduleChange(schedule, now);
  }
  const until = group.chatOverrideUntil;
  return isWithinSchedule(schedule, until) === override
    ? nextScheduleChange(schedule, until)
    : { at: until, opens: !override };
}
