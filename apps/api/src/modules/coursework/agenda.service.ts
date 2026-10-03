import type { Agenda } from '@acu/shared';
import { and, asc, count, eq, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  assignments,
  grades,
  groupAssistants,
  groupMembers,
  groups,
  submissions,
  type User,
} from '../../db/schema';

/** Assignments a student can still hand in and has not, the nearest deadline first. */
async function toHandIn(db: Database, user: User, now: Date): Promise<Agenda['toHandIn']> {
  const rows = await db
    .select({
      assignmentId: assignments.id,
      title: assignments.title,
      groupId: groups.id,
      groupName: groups.name,
      dueAt: assignments.dueAt,
      allowLate: assignments.allowLate,
    })
    .from(assignments)
    .innerJoin(groups, and(eq(groups.id, assignments.groupId), isNull(groups.archivedAt)))
    .innerJoin(
      groupMembers,
      and(
        eq(groupMembers.groupId, groups.id),
        eq(groupMembers.studentId, user.id),
        eq(groupMembers.status, 'active'),
      ),
    )
    .leftJoin(
      submissions,
      and(eq(submissions.assignmentId, assignments.id), eq(submissions.studentId, user.id)),
    )
    .where(and(isNull(submissions.assignmentId), isNull(assignments.closedAt)))
    .orderBy(sql`${assignments.dueAt} asc nulls last`, asc(assignments.createdAt));

  return rows
    .filter((row) => row.dueAt === null || now <= row.dueAt || row.allowLate)
    .map((row) => ({
      assignmentId: row.assignmentId,
      title: row.title,
      groupId: row.groupId,
      groupName: row.groupName,
      dueAt: row.dueAt?.toISOString() ?? null,
      overdue: row.dueAt !== null && now > row.dueAt,
    }));
}

/** Handed-in work with no grade yet, in the groups a doctor owns or assists in. */
async function toGrade(db: Database, user: User): Promise<Agenda['toGrade']> {
  return db
    .select({
      assignmentId: assignments.id,
      title: assignments.title,
      groupId: groups.id,
      groupName: groups.name,
      waiting: count(),
    })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(groups, and(eq(groups.id, assignments.groupId), isNull(groups.archivedAt)))
    .innerJoin(
      groupMembers,
      and(
        eq(groupMembers.groupId, groups.id),
        eq(groupMembers.studentId, submissions.studentId),
        eq(groupMembers.status, 'active'),
      ),
    )
    .leftJoin(
      grades,
      and(eq(grades.columnId, assignments.columnId), eq(grades.studentId, submissions.studentId)),
    )
    .where(
      and(
        isNull(grades.columnId),
        or(
          eq(groups.doctorId, user.id),
          sql`exists (select 1 from ${groupAssistants} where ${groupAssistants.groupId} = ${groups.id} and ${groupAssistants.userId} = ${user.id})`,
        ),
      ),
    )
    .groupBy(assignments.id, assignments.title, groups.id, groups.name, assignments.createdAt)
    .orderBy(asc(assignments.createdAt));
}

/** What is waiting for this person across all their groups, for their dashboard. */
export async function agendaFor(db: Database, user: User, now: Date): Promise<Agenda> {
  return {
    toHandIn: user.role === 'student' ? await toHandIn(db, user, now) : [],
    toGrade: user.role === 'doctor' ? await toGrade(db, user) : [],
  };
}
