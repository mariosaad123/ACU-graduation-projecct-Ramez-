import type { AssistedGroup, Assistant, GroupMember, GroupMemberRole } from '@acu/shared';
import { and, asc, count, eq, inArray, or } from 'drizzle-orm';
import {
  doctorProfiles,
  groupAssistants,
  groupMembers,
  groups,
  users,
  type User,
} from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { unreadCounts } from '../chat/chat.service';
import { fileUrl } from '../files/files.service';
import { notify, type NotifyContext } from '../notifications/notifications.service';
import { avatarUrlOf } from '../users/avatar';
import {
  assertActive,
  audit,
  findOwnedGroup,
  loadMember,
  type GroupsContext,
} from './groups.service';

export type RolesContext = GroupsContext & NotifyContext;

/** The doctor makes an active student a moderator or the representative, or a plain member again. */
export async function setMemberRole(
  context: RolesContext,
  doctor: User,
  groupId: string,
  studentId: string,
  role: GroupMemberRole,
): Promise<GroupMember> {
  const { db } = context;
  const group = await findOwnedGroup(db, doctor.id, groupId);
  assertActive(group);
  const [before] = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, group.id),
        eq(groupMembers.studentId, studentId),
        eq(groupMembers.status, 'active'),
      ),
    );
  if (!before) {
    throw new HttpError(404, 'NOT_FOUND', 'Student not found in this group');
  }
  if (before.role !== role) {
    await db
      .update(groupMembers)
      .set({ role })
      .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.studentId, studentId)));
    await audit(context, doctor, 'group.member_role_changed', {
      groupId,
      studentId,
      from: before.role,
      to: role,
    });
    if (role !== 'student') {
      await notify(context, {
        kind: 'role',
        groupId: group.id,
        groupName: group.name,
        actor: { id: doctor.id, name: doctor.name },
        recipients: [studentId],
        // The role itself: the app and the push text name it in the reader's language.
        excerpt: role,
      });
    }
  }
  return loadMember(db, group.id, doctor.id, studentId);
}

async function loadAssistants(
  context: GroupsContext,
  groupId: string,
  userId?: string,
): Promise<Assistant[]> {
  const rows = await context.db
    .select({
      id: users.id,
      name: doctorProfiles.displayName,
      email: doctorProfiles.universityEmail,
      avatarUrl: users.avatarUrl,
      avatarFileId: users.avatarFileId,
      addedAt: groupAssistants.addedAt,
    })
    .from(groupAssistants)
    .innerJoin(users, eq(users.id, groupAssistants.userId))
    .innerJoin(doctorProfiles, eq(doctorProfiles.userId, users.id))
    .where(
      and(
        eq(groupAssistants.groupId, groupId),
        userId ? eq(groupAssistants.userId, userId) : undefined,
      ),
    )
    .orderBy(asc(groupAssistants.addedAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: avatarUrlOf(row),
    addedAt: row.addedAt.toISOString(),
  }));
}

export async function listAssistants(
  context: GroupsContext,
  doctor: User,
  groupId: string,
): Promise<Assistant[]> {
  const group = await findOwnedGroup(context.db, doctor.id, groupId);
  return loadAssistants(context, group.id);
}

/**
 * Adds a teaching assistant by the email of their doctor account (the Google one or the
 * university one). Only an active doctor account can be one, and never the group's own doctor.
 */
export async function addAssistant(
  context: RolesContext,
  doctor: User,
  groupId: string,
  email: string,
): Promise<Assistant> {
  const { db, now } = context;
  const group = await findOwnedGroup(db, doctor.id, groupId);
  assertActive(group);
  const [candidate] = await db
    .select({ id: users.id, status: doctorProfiles.status, disabledAt: users.disabledAt })
    .from(users)
    .innerJoin(doctorProfiles, eq(doctorProfiles.userId, users.id))
    .where(
      and(
        eq(users.role, 'doctor'),
        or(eq(users.email, email), eq(doctorProfiles.universityEmail, email)),
      ),
    );
  if (candidate?.status !== 'active' || candidate.disabledAt) {
    throw new HttpError(404, 'ASSISTANT_NOT_FOUND', 'No active doctor account uses this email');
  }
  if (candidate.id === doctor.id) {
    throw new HttpError(409, 'ALREADY_ASSISTANT', 'You already run this group');
  }
  const inserted = await db
    .insert(groupAssistants)
    .values({ groupId: group.id, userId: candidate.id, addedAt: now() })
    .onConflictDoNothing()
    .returning({ userId: groupAssistants.userId });
  if (inserted.length === 0) {
    throw new HttpError(409, 'ALREADY_ASSISTANT', 'This doctor already helps run the group');
  }
  await audit(context, doctor, 'group.assistant_added', { groupId, assistantId: candidate.id });
  await notify(context, {
    kind: 'role',
    groupId: group.id,
    groupName: group.name,
    actor: { id: doctor.id, name: doctor.name },
    recipients: [candidate.id],
    excerpt: 'assistant',
  });
  const [assistant] = await loadAssistants(context, group.id, candidate.id);
  if (!assistant) {
    throw new Error('Assistant was not added');
  }
  return assistant;
}

export async function removeAssistant(
  context: GroupsContext,
  doctor: User,
  groupId: string,
  assistantId: string,
): Promise<void> {
  const group = await findOwnedGroup(context.db, doctor.id, groupId);
  const removed = await context.db
    .delete(groupAssistants)
    .where(and(eq(groupAssistants.groupId, group.id), eq(groupAssistants.userId, assistantId)))
    .returning({ userId: groupAssistants.userId });
  if (removed.length === 0) {
    throw new HttpError(404, 'NOT_FOUND', 'Assistant not found');
  }
  await audit(context, doctor, 'group.assistant_removed', { groupId, assistantId });
}

/** Groups a doctor helps run as a teaching assistant, newest first. */
export async function listAssistedGroups(
  context: GroupsContext,
  doctor: User,
): Promise<AssistedGroup[]> {
  const { db } = context;
  const rows = await db
    .select({ group: groups, doctorName: doctorProfiles.displayName })
    .from(groupAssistants)
    .innerJoin(groups, eq(groups.id, groupAssistants.groupId))
    .innerJoin(doctorProfiles, eq(doctorProfiles.userId, groups.doctorId))
    .where(eq(groupAssistants.userId, doctor.id))
    .orderBy(asc(groups.archivedAt), asc(groups.name));
  const ids = rows.map((row) => row.group.id);
  const [unread, students] = await Promise.all([
    unreadCounts(db, doctor.id, ids),
    ids.length === 0
      ? []
      : db
          .select({ groupId: groupMembers.groupId, total: count() })
          .from(groupMembers)
          .where(and(inArray(groupMembers.groupId, ids), eq(groupMembers.status, 'active')))
          .groupBy(groupMembers.groupId),
  ]);
  const studentCount = new Map(students.map((row) => [row.groupId, row.total]));
  return rows.map(({ group, doctorName }) => ({
    id: group.id,
    name: group.name,
    language: group.language,
    photoUrl: group.photoFileId ? fileUrl(group.photoFileId) : null,
    doctorName,
    archived: group.archivedAt !== null,
    students: studentCount.get(group.id) ?? 0,
    unread: unread.get(group.id) ?? 0,
    role: 'assistant',
  }));
}
