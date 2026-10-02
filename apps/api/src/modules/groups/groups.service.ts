import type {
  Group,
  GroupCreateRequest,
  GroupMember,
  GroupMemberStatus,
  GroupUpdateRequest,
} from '@acu/shared';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import * as z from 'zod/mini';
import type { Database, Transaction } from '../../db/client';
import { foreignKeyViolation } from '../../db/errors';
import {
  doctorProfiles,
  groupMembers,
  groups,
  studentLanguages,
  studentProfiles,
  users,
  type Group as GroupRow,
  type User,
} from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { recordAudit, type AuditAction } from '../audit/audit';
import { listDoctorLanguages } from '../doctors/doctor-languages.service';
import { ensureStudentLanguage } from '../students/student-languages.service';
import { unreadCounts } from '../chat/chat.service';
import {
  fileUrl,
  removeFile,
  saveUpload,
  type FilesContext,
  type Upload,
} from '../files/files.service';
import { avatarUrlOf } from '../users/avatar';
import { generateJoinCode } from './join-code';

export interface GroupsContext {
  db: Database;
  now: () => Date;
  ipAddress: string | undefined;
}

const uuid = z.string().check(z.uuid());

/** Ids come from the URL. A malformed one is simply a group or student that does not exist. */
export function parseId(value: unknown, what = 'Group'): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(404, 'NOT_FOUND', `${what} not found`);
  }
  return parsed.data;
}

/**
 * A group that is not the doctor's own answers exactly like one that does not exist, so a doctor
 * cannot learn anything about other doctors' groups.
 */
async function findOwnedGroup(
  db: Database | Transaction,
  doctorId: string,
  groupId: string,
  lock = false,
): Promise<GroupRow> {
  const query = db
    .select()
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.doctorId, doctorId)));
  const [group] = lock ? await query.for('update') : await query;
  if (!group) {
    throw new HttpError(404, 'NOT_FOUND', 'Group not found');
  }
  return group;
}

/** An archived group is read-only until it is restored. */
function assertActive(group: GroupRow): void {
  if (group.archivedAt) {
    throw new HttpError(409, 'GROUP_ARCHIVED', 'This group is archived');
  }
}

async function countMembers(db: Database | Transaction, groupIds: string[]) {
  const counts = new Map<string, Group['counts']>();
  for (const id of groupIds) {
    counts.set(id, { active: 0, pending: 0, out: 0 });
  }
  if (groupIds.length === 0) {
    return counts;
  }
  const rows = await db
    .select({ groupId: groupMembers.groupId, status: groupMembers.status, total: count() })
    .from(groupMembers)
    .where(inArray(groupMembers.groupId, groupIds))
    .groupBy(groupMembers.groupId, groupMembers.status);
  for (const row of rows) {
    const entry = counts.get(row.groupId);
    if (!entry) {
      continue;
    }
    if (row.status === 'active') {
      entry.active += row.total;
    } else if (row.status === 'pending') {
      entry.pending += row.total;
    } else {
      entry.out += row.total;
    }
  }
  return counts;
}

function toGroup(row: GroupRow, counts: Group['counts'] | undefined, unread = 0): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    language: row.language,
    joinCode: row.joinCode,
    joinOpen: row.joinOpen,
    requiresApproval: row.requiresApproval,
    chatOpen: row.chatOpen,
    chatRateLimit: row.chatRateLimit,
    photoUrl: row.photoFileId ? fileUrl(row.photoFileId) : null,
    archived: row.archivedAt !== null,
    createdAt: row.createdAt.toISOString(),
    counts: counts ?? { active: 0, pending: 0, out: 0 },
    unread,
  };
}

async function groupDto(db: Database, row: GroupRow): Promise<Group> {
  const [counts, unread] = await Promise.all([
    countMembers(db, [row.id]),
    unreadCounts(db, row.doctorId, [row.id]),
  ]);
  return toGroup(row, counts.get(row.id), unread.get(row.id));
}

async function audit(
  context: GroupsContext,
  actor: User,
  action: AuditAction,
  metadata: Record<string, unknown>,
): Promise<void> {
  await recordAudit(context.db, {
    at: context.now(),
    actorUserId: actor.id,
    action,
    metadata,
    ipAddress: context.ipAddress,
  });
}

/** Groups in use first, newest first; archived ones after them. */
export async function listGroups(db: Database, doctorId: string): Promise<Group[]> {
  const rows = await db
    .select()
    .from(groups)
    .where(eq(groups.doctorId, doctorId))
    .orderBy(sql`${groups.archivedAt} is not null`, desc(groups.createdAt));
  const ids = rows.map((row) => row.id);
  const [counts, unread] = await Promise.all([
    countMembers(db, ids),
    unreadCounts(db, doctorId, ids),
  ]);
  return rows.map((row) => toGroup(row, counts.get(row.id), unread.get(row.id)));
}

const CODE_ATTEMPTS = 5;

export async function createGroup(
  context: GroupsContext,
  doctor: User,
  request: GroupCreateRequest,
): Promise<Group> {
  const { db, now } = context;
  const taught = await listDoctorLanguages(db, doctor.id);
  if (!taught.includes(request.language)) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'You do not teach this language', {
      fields: { language: 'not_taught' },
    });
  }

  // A clash among 6.6e11 codes is very unlikely, but it is handled rather than assumed away.
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const [created] = await insertGroup(db, doctor, request, now());
    if (created) {
      await audit(context, doctor, 'group.created', {
        groupId: created.id,
        language: created.language,
      });
      return toGroup(created, undefined);
    }
  }
  throw new Error('Could not find a free join code');
}

async function insertGroup(db: Database, doctor: User, request: GroupCreateRequest, at: Date) {
  try {
    return await db
      .insert(groups)
      .values({
        doctorId: doctor.id,
        name: request.name,
        description: request.description ?? null,
        requiresApproval: request.requiresApproval ?? false,
        language: request.language,
        joinCode: generateJoinCode(),
        createdAt: at,
        updatedAt: at,
      })
      .onConflictDoNothing({ target: groups.joinCode })
      .returning();
  } catch (error) {
    // The language was dropped from the doctor's list at the same moment.
    if (foreignKeyViolation(error) === 'groups_doctor_language_fk') {
      throw new HttpError(400, 'VALIDATION_FAILED', 'You do not teach this language', {
        fields: { language: 'not_taught' },
      });
    }
    throw error;
  }
}

export async function updateGroup(
  context: GroupsContext,
  doctor: User,
  groupId: string,
  request: GroupUpdateRequest,
): Promise<Group> {
  const { db, now } = context;
  // Parsed JSON carries only the fields that were sent.
  const changes = { ...request };

  const updated = await db.transaction(async (tx) => {
    const group = await findOwnedGroup(tx, doctor.id, groupId, true);
    assertActive(group);
    if (Object.keys(changes).length === 0) {
      return group;
    }
    const [row] = await tx
      .update(groups)
      .set({ ...changes, updatedAt: now() })
      .where(eq(groups.id, group.id))
      .returning();
    return row ?? group;
  });

  if (Object.keys(changes).length > 0) {
    await audit(context, doctor, 'group.updated', { groupId, changes: Object.keys(changes) });
  }
  return groupDto(db, updated);
}

/** The old code stops working at once: useful when it has been shared too widely. */
export async function regenerateJoinCode(
  context: GroupsContext,
  doctor: User,
  groupId: string,
): Promise<Group> {
  const { db, now } = context;
  const group = await findOwnedGroup(db, doctor.id, groupId);
  assertActive(group);

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    try {
      const [row] = await db
        .update(groups)
        .set({ joinCode: generateJoinCode(), updatedAt: now() })
        .where(eq(groups.id, group.id))
        .returning();
      if (row) {
        await audit(context, doctor, 'group.code_regenerated', { groupId });
        return await groupDto(db, row);
      }
    } catch (error) {
      if (attempt === CODE_ATTEMPTS - 1) {
        throw error;
      }
    }
  }
  throw new Error('Could not find a free join code');
}

export async function setGroupArchived(
  context: GroupsContext,
  doctor: User,
  groupId: string,
  archived: boolean,
): Promise<Group> {
  const { db, now } = context;
  const group = await findOwnedGroup(db, doctor.id, groupId);
  if ((group.archivedAt !== null) === archived) {
    return groupDto(db, group);
  }
  const [row] = await db
    .update(groups)
    .set({ archivedAt: archived ? now() : null, updatedAt: now() })
    .where(eq(groups.id, group.id))
    .returning();
  await audit(context, doctor, archived ? 'group.archived' : 'group.restored', { groupId });
  return groupDto(db, row ?? group);
}

/** Members of one group, or one member, as the doctor sees them. */
async function loadMembers(
  db: Database | Transaction,
  groupId: string,
  doctorId: string,
  studentId?: string,
): Promise<GroupMember[]> {
  const rows = await db
    .select({
      member: groupMembers,
      student: {
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        avatarFileId: users.avatarFileId,
        disabledAt: users.disabledAt,
        suspendedByUserId: users.suspendedByUserId,
        suspensionReason: users.suspensionReason,
      },
      activeLanguage: studentProfiles.activeLanguage,
      suspendedByName: doctorProfiles.displayName,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.studentId))
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .leftJoin(doctorProfiles, eq(doctorProfiles.userId, users.suspendedByUserId))
    .where(
      studentId
        ? and(eq(groupMembers.groupId, groupId), eq(groupMembers.studentId, studentId))
        : eq(groupMembers.groupId, groupId),
    )
    .orderBy(asc(groupMembers.joinedAt), asc(users.name));

  const ids = rows.map((row) => row.student.id);
  const languageRows =
    ids.length === 0
      ? []
      : await db
          .select({ userId: studentLanguages.userId, language: studentLanguages.language })
          .from(studentLanguages)
          .where(inArray(studentLanguages.userId, ids))
          .orderBy(asc(studentLanguages.enrolledAt), asc(studentLanguages.language));

  return rows.map(({ member, student, activeLanguage, suspendedByName }) => ({
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      avatarUrl: avatarUrlOf(student),
      languages: languageRows.filter((row) => row.userId === student.id).map((row) => row.language),
      activeLanguage,
      suspension: student.disabledAt
        ? {
            byMe: student.suspendedByUserId === doctorId,
            byName: student.suspendedByUserId ? suspendedByName : null,
            reason: student.suspensionReason,
            at: student.disabledAt.toISOString(),
          }
        : null,
    },
    status: member.status,
    chatMuted: member.chatMuted,
    joinedAt: member.joinedAt.toISOString(),
    decidedAt: member.decidedAt?.toISOString() ?? null,
    removedAt: member.removedAt?.toISOString() ?? null,
    leftByThemselves: member.status === 'left',
  }));
}

async function loadMember(
  db: Database,
  groupId: string,
  doctorId: string,
  studentId: string,
): Promise<GroupMember> {
  const [member] = await loadMembers(db, groupId, doctorId, studentId);
  if (!member) {
    throw new HttpError(404, 'NOT_FOUND', 'Student not found in this group');
  }
  return member;
}

export async function listMembers(
  db: Database,
  doctor: User,
  groupId: string,
): Promise<GroupMember[]> {
  await findOwnedGroup(db, doctor.id, groupId);
  return loadMembers(db, groupId, doctor.id);
}

/** Puts a student in the group as an active member, whatever their earlier place in it. */
async function placeActive(
  tx: Transaction,
  group: GroupRow,
  studentId: string,
  at: Date,
): Promise<void> {
  await tx
    .insert(groupMembers)
    .values({ groupId: group.id, studentId, status: 'active', joinedAt: at, decidedAt: at })
    .onConflictDoUpdate({
      target: [groupMembers.groupId, groupMembers.studentId],
      set: { status: 'active', decidedAt: at, removedAt: null, removedByUserId: null },
    });
  await ensureStudentLanguage(tx, studentId, group.language, at);
}

/** Adds a student who already has an account, by the email they sign in with. */
export async function addMemberByEmail(
  context: GroupsContext,
  doctor: User,
  groupId: string,
  email: string,
): Promise<GroupMember> {
  const { db, now } = context;

  const studentId = await db.transaction(async (tx) => {
    const group = await findOwnedGroup(tx, doctor.id, groupId, true);
    assertActive(group);

    // "No account" and "not a student" answer alike: a doctor learns nothing about other roles.
    const [student] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${email}`, eq(users.role, 'student')))
      .limit(1);
    if (!student) {
      throw new HttpError(404, 'STUDENT_NOT_FOUND', 'No student uses this email');
    }

    const [existing] = await tx
      .select({ status: groupMembers.status })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.studentId, student.id)))
      .for('update');
    if (existing?.status === 'active') {
      throw new HttpError(409, 'ALREADY_MEMBER', 'This student is already in the group');
    }

    await placeActive(tx, group, student.id, now());
    return student.id;
  });

  await audit(context, doctor, 'group.member_added', { groupId, studentId });
  return loadMember(db, groupId, doctor.id, studentId);
}

export const MEMBER_ACTIONS = ['approve', 'reject', 'remove', 'restore'] as const;
export type MemberAction = (typeof MEMBER_ACTIONS)[number];

const MEMBER_AUDIT: Record<MemberAction, AuditAction> = {
  approve: 'group.member_approved',
  reject: 'group.member_rejected',
  remove: 'group.member_removed',
  restore: 'group.member_restored',
};

/**
 * Where each action may start from, and where it leads. An action that is already done does
 * nothing (a double click is harmless); one that no longer applies reports the change.
 */
const TRANSITIONS: Record<
  MemberAction,
  { from: readonly GroupMemberStatus[]; to: 'active' | 'removed' }
> = {
  approve: { from: ['pending'], to: 'active' },
  reject: { from: ['pending'], to: 'removed' },
  remove: { from: ['pending', 'active'], to: 'removed' },
  restore: { from: ['pending', 'removed', 'left'], to: 'active' },
};

export async function changeMember(
  context: GroupsContext,
  doctor: User,
  groupId: string,
  studentId: string,
  action: MemberAction,
): Promise<GroupMember> {
  const { db, now } = context;
  const transition = TRANSITIONS[action];

  const changed = await db.transaction(async (tx) => {
    const group = await findOwnedGroup(tx, doctor.id, groupId, true);
    assertActive(group);
    const [member] = await tx
      .select({ status: groupMembers.status })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.studentId, studentId)))
      .for('update');
    if (!member) {
      throw new HttpError(404, 'NOT_FOUND', 'Student not found in this group');
    }
    const alreadyThere =
      member.status === transition.to || (transition.to === 'removed' && member.status === 'left');
    if (alreadyThere) {
      return false;
    }
    if (!transition.from.includes(member.status)) {
      throw new HttpError(
        409,
        'MEMBER_STATE_CHANGED',
        'This student’s place in the group changed',
        {
          details: { status: member.status },
        },
      );
    }

    if (transition.to === 'active') {
      await placeActive(tx, group, studentId, now());
    } else {
      await tx
        .update(groupMembers)
        .set({
          status: 'removed',
          removedAt: now(),
          removedByUserId: doctor.id,
          decidedAt: member.status === 'pending' ? now() : undefined,
        })
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.studentId, studentId)));
    }
    return true;
  });

  if (changed) {
    await audit(context, doctor, MEMBER_AUDIT[action], { groupId, studentId });
  }
  return loadMember(db, groupId, doctor.id, studentId);
}

/** Moves a student from one of the doctor's groups to another; returns their new place. */
export async function moveMember(
  context: GroupsContext,
  doctor: User,
  groupId: string,
  studentId: string,
  toGroupId: string,
): Promise<GroupMember> {
  const { db, now } = context;
  if (toGroupId === groupId) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Choose another group', {
      fields: { toGroupId: 'same_group' },
    });
  }

  await db.transaction(async (tx) => {
    // Locked in a fixed order, so two opposite moves cannot wait on each other forever.
    const [first, second] = [groupId, toGroupId].sort();
    const locked = new Map<string, GroupRow>();
    for (const id of [first, second]) {
      if (id) {
        locked.set(id, await findOwnedGroup(tx, doctor.id, id, true));
      }
    }
    const source = locked.get(groupId);
    const target = locked.get(toGroupId);
    if (!source || !target) {
      throw new HttpError(404, 'NOT_FOUND', 'Group not found');
    }
    assertActive(source);
    assertActive(target);

    const [member] = await tx
      .select({ status: groupMembers.status })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, source.id), eq(groupMembers.studentId, studentId)))
      .for('update');
    if (!member) {
      throw new HttpError(404, 'NOT_FOUND', 'Student not found in this group');
    }
    if (member.status !== 'active' && member.status !== 'pending') {
      throw new HttpError(
        409,
        'MEMBER_STATE_CHANGED',
        'This student’s place in the group changed',
        {
          details: { status: member.status },
        },
      );
    }

    await placeActive(tx, target, studentId, now());
    await tx
      .update(groupMembers)
      .set({ status: 'removed', removedAt: now(), removedByUserId: doctor.id })
      .where(and(eq(groupMembers.groupId, source.id), eq(groupMembers.studentId, studentId)));
  });

  await audit(context, doctor, 'group.member_moved', { from: groupId, to: toGroupId, studentId });
  return loadMember(db, toGroupId, doctor.id, studentId);
}

/** True when the student is, or was, in one of the doctor's groups. */
export async function teachesStudent(
  db: Database | Transaction,
  doctorId: string,
  studentId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groups.doctorId, doctorId), eq(groupMembers.studentId, studentId)))
    .limit(1);
  return row !== undefined;
}

/** Sets or clears the group's photo; the previous one is deleted. */
export async function setGroupPhoto(
  context: GroupsContext & FilesContext,
  doctor: User,
  groupId: string,
  upload: Upload | null,
): Promise<Group> {
  const { db, now } = context;
  const group = await findOwnedGroup(db, doctor.id, groupId);
  assertActive(group);
  const saved = upload ? await saveUpload(context, doctor, upload, 'group_photo', group.id) : null;
  const [row] = await db
    .update(groups)
    .set({ photoFileId: saved?.id ?? null, updatedAt: now() })
    .where(eq(groups.id, group.id))
    .returning();
  await removeFile(context, group.photoFileId);
  await audit(context, doctor, 'group.photo_changed', { groupId, removed: saved === null });
  return groupDto(db, row ?? group);
}

/** A muted student keeps reading the group chat but cannot write in it. */
export async function setChatMuted(
  context: GroupsContext,
  doctor: User,
  groupId: string,
  studentId: string,
  muted: boolean,
): Promise<GroupMember> {
  const { db } = context;
  const group = await findOwnedGroup(db, doctor.id, groupId);
  assertActive(group);
  const [updated] = await db
    .update(groupMembers)
    .set({ chatMuted: muted })
    .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.studentId, studentId)))
    .returning({ studentId: groupMembers.studentId });
  if (!updated) {
    throw new HttpError(404, 'NOT_FOUND', 'Student not found in this group');
  }
  await audit(context, doctor, muted ? 'group.chat_member_muted' : 'group.chat_member_unmuted', {
    groupId,
    studentId,
  });
  return loadMember(db, group.id, doctor.id, studentId);
}
