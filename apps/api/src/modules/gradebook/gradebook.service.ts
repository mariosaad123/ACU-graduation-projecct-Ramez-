import {
  type Activity,
  type Grade,
  type GradeColumn,
  type GradeColumnInput,
  type GradeInput,
  type Gradebook,
  type GradebookStudent,
  type MyGrades,
} from '@acu/shared';
import { and, asc, count, eq, inArray, isNotNull, isNull, max, ne, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  announcementReads,
  announcements,
  chatReads,
  files,
  gradeColumns,
  grades,
  groupMembers,
  groupMessages,
  polls,
  pollVotes,
  studentProfiles,
  users,
  type GradeColumnRow,
  type User,
} from '../../db/schema';
import { HttpError } from '../../http/http-error';
import type { ChatContext } from '../chat/chat.service';
import { notifyContext } from '../chat/chat.service';
import { namesOf } from '../chat/messages';
import { assertCan, assertNotArchived, groupAccess, type GroupAccess } from '../groups/access';
import { markReadFor, notify } from '../notifications/notifications.service';
import { avatarUrlOf } from '../users/avatar';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function toColumn(row: GradeColumnRow): GradeColumn {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    maxScore: row.maxScore,
    weight: row.weight,
    heldOn: row.heldOn,
    published: row.published,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
  };
}

async function teaching(context: ChatContext, user: User, groupId: string): Promise<GroupAccess> {
  const access = await groupAccess(context.db, user, groupId);
  assertCan(access, 'teach');
  return access;
}

async function findColumn(db: Database, groupId: string, columnId: string) {
  const [row] = await db
    .select()
    .from(gradeColumns)
    .where(and(eq(gradeColumns.id, columnId), eq(gradeColumns.groupId, groupId)));
  if (!row) {
    throw new HttpError(404, 'NOT_FOUND', 'Column not found');
  }
  return row;
}

/** Everyone who is or was a student of the group (not those still waiting), active ones first. */
async function studentsOf(db: Database, groupId: string) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      avatarFileId: users.avatarFileId,
      universityId: studentProfiles.universityId,
      status: groupMembers.status,
      joinedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.studentId))
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .where(and(eq(groupMembers.groupId, groupId), ne(groupMembers.status, 'pending')))
    .orderBy(sql`${groupMembers.status} <> 'active'`, asc(users.name));
}

/** How much each student takes part: messages, reading, voting, sharing, and when last seen. */
export async function activityOf(
  db: Database,
  groupId: string,
  studentIds: string[],
  now: Date,
): Promise<Map<string, Activity>> {
  const result = new Map<string, Activity>();
  if (studentIds.length === 0) {
    return result;
  }
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const [messages, seen, reads, votes, shared] = await Promise.all([
    db
      .select({
        userId: groupMessages.authorId,
        total: count(),
        thisWeek: sql`count(*) filter (where ${groupMessages.createdAt} >= ${weekAgo})`.mapWith(
          Number,
        ),
        last: max(groupMessages.createdAt),
      })
      .from(groupMessages)
      .where(
        and(
          eq(groupMessages.groupId, groupId),
          inArray(groupMessages.authorId, studentIds),
          isNull(groupMessages.deletedAt),
        ),
      )
      .groupBy(groupMessages.authorId),
    db
      .select({ userId: chatReads.userId, lastSeenAt: chatReads.lastSeenAt })
      .from(chatReads)
      .where(and(eq(chatReads.groupId, groupId), inArray(chatReads.userId, studentIds))),
    db
      .select({ userId: announcementReads.userId, total: count() })
      .from(announcementReads)
      .innerJoin(announcements, eq(announcements.id, announcementReads.announcementId))
      .where(
        and(
          eq(announcements.groupId, groupId),
          isNull(announcements.deletedAt),
          inArray(announcementReads.userId, studentIds),
        ),
      )
      .groupBy(announcementReads.userId),
    db
      .select({
        userId: pollVotes.userId,
        total: sql`count(distinct ${pollVotes.pollId})`.mapWith(Number),
      })
      .from(pollVotes)
      .innerJoin(polls, eq(polls.id, pollVotes.pollId))
      .where(and(eq(polls.groupId, groupId), inArray(pollVotes.userId, studentIds)))
      .groupBy(pollVotes.userId),
    db
      .select({ userId: files.ownerId, total: count() })
      .from(files)
      .where(
        and(
          eq(files.groupId, groupId),
          eq(files.purpose, 'chat'),
          inArray(files.ownerId, studentIds),
        ),
      )
      .groupBy(files.ownerId),
  ]);
  const by = <T extends { userId: string }>(rows: T[]) =>
    new Map(rows.map((row) => [row.userId, row]));
  const messageBy = by(messages);
  const seenBy = by(seen);
  const readBy = by(reads);
  const voteBy = by(votes);
  const sharedBy = by(shared);

  for (const id of studentIds) {
    const message = messageBy.get(id);
    const lastSeenAt = seenBy.get(id)?.lastSeenAt ?? null;
    result.set(id, {
      messages: message?.total ?? 0,
      messagesThisWeek: message?.thisWeek ?? 0,
      lastMessageAt: message?.last?.toISOString() ?? null,
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
      announcementsRead: readBy.get(id)?.total ?? 0,
      pollsAnswered: voteBy.get(id)?.total ?? 0,
      filesShared: sharedBy.get(id)?.total ?? 0,
      quiet: (message?.thisWeek ?? 0) === 0,
      away: lastSeenAt === null || lastSeenAt < weekAgo,
    });
  }
  return result;
}

export async function groupTotals(db: Database, groupId: string) {
  const [announcementCount, pollCount] = await Promise.all([
    db
      .select({ total: count() })
      .from(announcements)
      .where(and(eq(announcements.groupId, groupId), isNull(announcements.deletedAt))),
    db
      .select({ total: count() })
      .from(polls)
      .innerJoin(groupMessages, eq(groupMessages.id, polls.messageId))
      .where(and(eq(polls.groupId, groupId), isNull(groupMessages.deletedAt))),
  ]);
  return { announcements: announcementCount[0]?.total ?? 0, polls: pollCount[0]?.total ?? 0 };
}

function toGrade(row: typeof grades.$inferSelect): Grade {
  return {
    columnId: row.columnId,
    studentId: row.studentId,
    status: row.status,
    score: row.score,
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function loadGradebook(db: Database, groupId: string, now: Date): Promise<Gradebook> {
  const [columnRows, students] = await Promise.all([
    db
      .select()
      .from(gradeColumns)
      .where(eq(gradeColumns.groupId, groupId))
      .orderBy(asc(gradeColumns.position), asc(gradeColumns.createdAt)),
    studentsOf(db, groupId),
  ]);
  const columnIds = columnRows.map((column) => column.id);
  const [gradeRows, activity, totals] = await Promise.all([
    columnIds.length === 0
      ? []
      : db.select().from(grades).where(inArray(grades.columnId, columnIds)),
    activityOf(
      db,
      groupId,
      students.map((student) => student.id),
      now,
    ),
    groupTotals(db, groupId),
  ]);

  const list: GradebookStudent[] = students.map((student) => ({
    id: student.id,
    name: student.name,
    email: student.email,
    avatarUrl: avatarUrlOf(student),
    universityId: student.universityId ?? null,
    status: student.status,
    joinedAt: student.joinedAt.toISOString(),
    activity: activity.get(student.id) ?? {
      messages: 0,
      messagesThisWeek: 0,
      lastMessageAt: null,
      lastSeenAt: null,
      announcementsRead: 0,
      pollsAnswered: 0,
      filesShared: 0,
      quiet: true,
      away: true,
    },
  }));
  return {
    columns: columnRows.map(toColumn),
    students: list,
    grades: gradeRows.map(toGrade),
    totals,
  };
}

export async function getGradebook(
  context: ChatContext,
  user: User,
  groupId: string,
): Promise<Gradebook> {
  const access = await teaching(context, user, groupId);
  return loadGradebook(context.db, access.group.id, context.now());
}

async function announcePublished(
  context: ChatContext,
  access: GroupAccess,
  user: User,
  column: GradeColumnRow,
): Promise<void> {
  const students = await context.db
    .select({ id: groupMembers.studentId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, access.group.id), eq(groupMembers.status, 'active')));
  const actorName = (await namesOf(context.db, [user.id])).get(user.id)?.name ?? user.name;
  await notify(notifyContext(context), {
    kind: 'grade',
    groupId: access.group.id,
    groupName: access.group.name,
    actor: { id: user.id, name: actorName },
    recipients: students.map((student) => student.id),
    gradeColumnId: column.id,
    excerpt: column.title,
  });
}

export async function createColumn(
  context: ChatContext,
  user: User,
  groupId: string,
  input: GradeColumnInput,
): Promise<GradeColumn> {
  const { db, now } = context;
  const access = await teaching(context, user, groupId);
  assertNotArchived(access);
  const [last] = await db
    .select({ position: max(gradeColumns.position) })
    .from(gradeColumns)
    .where(eq(gradeColumns.groupId, access.group.id));
  const [row] = await db
    .insert(gradeColumns)
    .values({
      groupId: access.group.id,
      ...input,
      position: (last?.position ?? -1) + 1,
      createdAt: now(),
    })
    .returning();
  if (!row) {
    throw new Error('Column was not created');
  }
  if (row.published) {
    await announcePublished(context, access, user, row);
  }
  return toColumn(row);
}

export async function updateColumn(
  context: ChatContext,
  user: User,
  groupId: string,
  columnId: string,
  changes: Partial<GradeColumnInput>,
): Promise<GradeColumn> {
  const { db } = context;
  const access = await teaching(context, user, groupId);
  assertNotArchived(access);
  const column = await findColumn(db, access.group.id, columnId);
  if (changes.maxScore !== undefined && changes.maxScore < column.maxScore) {
    const [above] = await db
      .select({ total: count() })
      .from(grades)
      .where(and(eq(grades.columnId, column.id), sql`${grades.score} > ${changes.maxScore}`));
    if ((above?.total ?? 0) > 0) {
      throw new HttpError(409, 'SCORE_TOO_HIGH', 'Some scores are above the new maximum', {
        details: { count: above?.total ?? 0 },
      });
    }
  }
  const [row] = await db
    .update(gradeColumns)
    .set(changes)
    .where(eq(gradeColumns.id, column.id))
    .returning();
  if (row && row.published && !column.published) {
    await announcePublished(context, access, user, row);
  }
  return toColumn(row ?? column);
}

export async function deleteColumn(
  context: ChatContext,
  user: User,
  groupId: string,
  columnId: string,
): Promise<void> {
  const access = await teaching(context, user, groupId);
  assertNotArchived(access);
  const column = await findColumn(context.db, access.group.id, columnId);
  await context.db.delete(gradeColumns).where(eq(gradeColumns.id, column.id));
}

/** Puts the columns in the order given; ids not in the group are refused. */
export async function reorderColumns(
  context: ChatContext,
  user: User,
  groupId: string,
  ids: string[],
): Promise<GradeColumn[]> {
  const { db } = context;
  const access = await teaching(context, user, groupId);
  assertNotArchived(access);
  const rows = await db
    .select({ id: gradeColumns.id })
    .from(gradeColumns)
    .where(eq(gradeColumns.groupId, access.group.id));
  const known = new Set(rows.map((row) => row.id));
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Send every column of the group once');
  }
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) {
      await tx.update(gradeColumns).set({ position }).where(eq(gradeColumns.id, id));
    }
  });
  const ordered = await db
    .select()
    .from(gradeColumns)
    .where(eq(gradeColumns.groupId, access.group.id))
    .orderBy(asc(gradeColumns.position));
  return ordered.map(toColumn);
}

/**
 * Sets several students' cells in one column. An empty score (not absent, not excused) clears the
 * cell. Scores above the column's maximum are refused, and so are people who never were students
 * of the group.
 */
export async function setGrades(
  context: ChatContext,
  user: User,
  groupId: string,
  columnId: string,
  entries: (GradeInput & { studentId: string })[],
): Promise<Grade[]> {
  const { db, now } = context;
  const access = await teaching(context, user, groupId);
  assertNotArchived(access);
  const column = await findColumn(db, access.group.id, columnId);
  const studentIds = [...new Set(entries.map((entry) => entry.studentId))];
  const members = await db
    .select({ id: groupMembers.studentId })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, access.group.id),
        inArray(groupMembers.studentId, studentIds),
        ne(groupMembers.status, 'pending'),
      ),
    );
  const memberSet = new Set(members.map((member) => member.id));
  if (studentIds.some((id) => !memberSet.has(id))) {
    throw new HttpError(404, 'STUDENT_NOT_FOUND', 'Student not found in this group');
  }
  if (entries.some((entry) => entry.status === 'scored' && (entry.score ?? 0) > column.maxScore)) {
    throw new HttpError(400, 'SCORE_TOO_HIGH', 'A score is above the maximum', {
      details: { maxScore: column.maxScore },
    });
  }

  await db.transaction(async (tx) => {
    for (const entry of entries) {
      const empty = entry.status === 'scored' && entry.score === null && (entry.note ?? '') === '';
      if (empty) {
        await tx
          .delete(grades)
          .where(and(eq(grades.columnId, column.id), eq(grades.studentId, entry.studentId)));
        continue;
      }
      const values = {
        status: entry.status,
        score: entry.status === 'scored' ? entry.score : null,
        note: entry.note === '' ? null : entry.note,
        updatedAt: now(),
        updatedByUserId: user.id,
      };
      await tx
        .insert(grades)
        .values({ columnId: column.id, studentId: entry.studentId, ...values })
        .onConflictDoUpdate({ target: [grades.columnId, grades.studentId], set: values });
    }
  });
  const rows = await db
    .select()
    .from(grades)
    .where(and(eq(grades.columnId, column.id), inArray(grades.studentId, studentIds)));
  return rows.map(toGrade);
}

/** A student's own published grades, with each column's class average. */
export async function myGrades(
  context: ChatContext,
  user: User,
  groupId: string,
): Promise<MyGrades> {
  const { db, now } = context;
  const access = await groupAccess(db, user, groupId);
  const columns = await db
    .select()
    .from(gradeColumns)
    .where(and(eq(gradeColumns.groupId, access.group.id), eq(gradeColumns.published, true)))
    .orderBy(asc(gradeColumns.position));
  const ids = columns.map((column) => column.id);
  const [mine, averages] = await Promise.all([
    ids.length === 0
      ? []
      : db
          .select()
          .from(grades)
          .where(and(inArray(grades.columnId, ids), eq(grades.studentId, user.id))),
    ids.length === 0
      ? []
      : db
          .select({
            columnId: grades.columnId,
            average: sql`avg(${grades.score})`.mapWith(Number),
          })
          .from(grades)
          .where(
            and(
              inArray(grades.columnId, ids),
              eq(grades.status, 'scored'),
              isNotNull(grades.score),
            ),
          )
          .groupBy(grades.columnId),
  ]);
  await markReadFor(db, user.id, { groupGrades: access.group.id }, now());
  const mineBy = new Map(mine.map((row) => [row.columnId, row]));
  const averageBy = new Map(averages.map((row) => [row.columnId, row.average]));
  return {
    columns: columns.map((column) => {
      const grade = mineBy.get(column.id);
      const average = averageBy.get(column.id);
      return {
        id: column.id,
        title: column.title,
        kind: column.kind,
        maxScore: column.maxScore,
        weight: column.weight,
        heldOn: column.heldOn,
        average: average === undefined ? null : Math.round(average * 100) / 100,
        grade: grade ? { status: grade.status, score: grade.score, note: grade.note } : null,
      };
    }),
  };
}
