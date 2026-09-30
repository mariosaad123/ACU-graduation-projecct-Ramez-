import { normalizeJoinCode, type JoinPreview, type StudentGroup } from '@acu/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { doctorProfiles, groupMembers, groups, type User } from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { countRecentAudit, recordAudit } from '../audit/audit';
import { ensureStudentLanguage } from '../students/student-languages.service';
import type { GroupsContext } from './groups.service';

const MINUTE_MS = 60 * 1000;

/** Wrong codes allowed per student and hour: plenty for typos, far too few to guess one. */
export const JOIN_CODE_FAILURE_LIMIT = 10;
export const JOIN_CODE_FAILURE_WINDOW_MS = 60 * MINUTE_MS;

async function assertAttemptsLeft(context: GroupsContext, student: User): Promise<number> {
  const since = new Date(context.now().getTime() - JOIN_CODE_FAILURE_WINDOW_MS);
  const failures = await countRecentAudit(
    context.db,
    student.id,
    'group.join_code_rejected',
    since,
  );
  if (failures >= JOIN_CODE_FAILURE_LIMIT) {
    throw new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong codes, try again later', {
      details: { retryAfterSeconds: JOIN_CODE_FAILURE_WINDOW_MS / 1000 },
    });
  }
  return failures;
}

async function rejectCode(context: GroupsContext, student: User, failures: number): Promise<never> {
  const attemptsLeft = Math.max(JOIN_CODE_FAILURE_LIMIT - failures - 1, 0);
  await recordAudit(context.db, {
    at: context.now(),
    actorUserId: student.id,
    action: 'group.join_code_rejected',
    metadata: { attemptsLeft },
    ipAddress: context.ipAddress,
  });
  throw new HttpError(404, 'INVALID_JOIN_CODE', 'No group has this code', {
    details: { attemptsLeft },
  });
}

/** The group behind a code, if this student may join it, with their current place in it. */
async function findJoinable(context: GroupsContext, student: User, rawCode: string) {
  const failures = await assertAttemptsLeft(context, student);
  const code = normalizeJoinCode(rawCode);
  if (!code) {
    return rejectCode(context, student, failures);
  }

  const [found] = await context.db
    .select({ group: groups, doctorName: doctorProfiles.displayName })
    .from(groups)
    .innerJoin(doctorProfiles, eq(doctorProfiles.userId, groups.doctorId))
    .where(eq(groups.joinCode, code));
  if (!found) {
    return rejectCode(context, student, failures);
  }

  const [membership] = await context.db
    .select({ status: groupMembers.status })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, found.group.id), eq(groupMembers.studentId, student.id)));

  // Joining again with the code would undo the doctor's decision.
  if (membership?.status === 'removed') {
    throw new HttpError(403, 'REMOVED_FROM_GROUP', 'The doctor removed you from this group');
  }
  const current =
    membership?.status === 'pending' || membership?.status === 'active' ? membership.status : null;
  if (!current && (found.group.archivedAt || !found.group.joinOpen)) {
    throw new HttpError(409, 'JOIN_CLOSED', 'This group is not accepting new students');
  }
  return { ...found, membership: current };
}

export async function previewJoin(
  context: GroupsContext,
  student: User,
  rawCode: string,
): Promise<JoinPreview> {
  const { group, doctorName, membership } = await findJoinable(context, student, rawCode);
  return {
    group: {
      name: group.name,
      description: group.description,
      language: group.language,
      doctorName,
      requiresApproval: group.requiresApproval,
    },
    membership,
  };
}

/**
 * Joins at once, or asks the doctor first when the group requires approval. The group's language
 * joins the student's languages when they become a member, without changing the active one.
 */
export async function joinGroup(
  context: GroupsContext,
  student: User,
  rawCode: string,
): Promise<{ status: 'pending' | 'active'; languageAdded: boolean }> {
  const { db, now } = context;
  const { group, membership } = await findJoinable(context, student, rawCode);
  if (membership) {
    throw new HttpError(409, 'ALREADY_MEMBER', 'You are already in this group');
  }
  const status = group.requiresApproval ? 'pending' : 'active';

  const languageAdded = await db.transaction(async (tx) => {
    const [placed] = await tx
      .insert(groupMembers)
      .values({
        groupId: group.id,
        studentId: student.id,
        status,
        joinedAt: now(),
        decidedAt: status === 'active' ? now() : null,
      })
      .onConflictDoUpdate({
        target: [groupMembers.groupId, groupMembers.studentId],
        set: {
          status,
          joinedAt: now(),
          decidedAt: status === 'active' ? now() : null,
          removedAt: null,
          removedByUserId: null,
        },
        // Only someone who left may come back this way; a removal in the meantime stands.
        setWhere: eq(groupMembers.status, 'left'),
      })
      .returning({ status: groupMembers.status });
    if (!placed) {
      throw new HttpError(409, 'MEMBER_STATE_CHANGED', 'Your place in this group changed');
    }
    return status === 'active'
      ? ensureStudentLanguage(tx, student.id, group.language, now())
      : false;
  });

  await recordAudit(db, {
    at: now(),
    actorUserId: student.id,
    action: status === 'active' ? 'group.joined' : 'group.join_requested',
    metadata: { groupId: group.id },
    ipAddress: context.ipAddress,
  });
  return { status, languageAdded };
}

/** The groups a student is in or waiting for. Archived groups have ended and are not listed. */
export async function listStudentGroups(db: Database, student: User): Promise<StudentGroup[]> {
  const rows = await db
    .select({
      group: groups,
      doctorName: doctorProfiles.displayName,
      status: groupMembers.status,
      joinedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .innerJoin(doctorProfiles, eq(doctorProfiles.userId, groups.doctorId))
    .where(
      and(
        eq(groupMembers.studentId, student.id),
        inArray(groupMembers.status, ['pending', 'active']),
        isNull(groups.archivedAt),
      ),
    )
    .orderBy(asc(groupMembers.joinedAt));

  return rows.map(({ group, doctorName, status, joinedAt }) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    language: group.language,
    doctorName,
    status: status === 'pending' ? 'pending' : 'active',
    joinedAt: joinedAt.toISOString(),
  }));
}

/** Leaves a group, or withdraws a request to join it. */
export async function leaveGroup(
  context: GroupsContext,
  student: User,
  groupId: string,
): Promise<void> {
  const { db, now } = context;
  const [left] = await db
    .update(groupMembers)
    .set({ status: 'left', removedAt: now(), removedByUserId: student.id })
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.studentId, student.id),
        inArray(groupMembers.status, ['pending', 'active']),
      ),
    )
    .returning({ groupId: groupMembers.groupId });
  if (!left) {
    throw new HttpError(404, 'NOT_FOUND', 'You are not in this group');
  }
  await recordAudit(db, {
    at: now(),
    actorUserId: student.id,
    action: 'group.left',
    metadata: { groupId },
    ipAddress: context.ipAddress,
  });
}
