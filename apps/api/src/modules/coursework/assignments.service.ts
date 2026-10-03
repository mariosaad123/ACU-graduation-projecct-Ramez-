import {
  ASSIGNMENT_MAX_FILES,
  SUBMISSION_MAX_FILES,
  type Assignment,
  type AssignmentDetail,
  type AssignmentInput,
  type AssignmentUpdate,
  type Attachment,
  type GradeInput,
  type Submission,
  type SubmissionInput,
  type SubmissionRow,
  type SubmissionState,
} from '@acu/shared';
import { and, asc, desc, eq, inArray, max } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  assignmentAttachments,
  assignments,
  files,
  gradeColumns,
  grades,
  groupMembers,
  studentProfiles,
  submissionFiles,
  submissions,
  users,
  type AssignmentRow,
  type GradeColumnRow,
  type User,
} from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { recordAudit } from '../audit/audit';
import type { ChatContext } from '../chat/chat.service';
import { notifyContext } from '../chat/chat.service';
import { namesOf } from '../chat/messages';
import { removeFile, saveUpload, toAttachment, type Upload } from '../files/files.service';
import { setGrades } from '../gradebook/gradebook.service';
import { assertCan, assertNotArchived, groupAccess, type GroupAccess } from '../groups/access';
import { markReadFor, notify } from '../notifications/notifications.service';
import { avatarUrlOf } from '../users/avatar';

type GradeRow = typeof grades.$inferSelect;

function tooManyFiles(maxCount: number): HttpError {
  return new HttpError(400, 'TOO_MANY_FILES', 'Too many files', { details: { maxCount } });
}

/** Whether work can be handed in now: not closed by hand, and before the deadline unless late work is taken. */
function acceptingNow(access: GroupAccess, row: AssignmentRow, now: Date): boolean {
  if (access.group.archivedAt || row.closedAt) {
    return false;
  }
  return row.dueAt === null || now <= row.dueAt || row.allowLate;
}

function toGradeInput(row: GradeRow | undefined): GradeInput | null {
  return row ? { status: row.status, score: row.score, note: row.note } : null;
}

function stateOf(submitted: { late: boolean } | undefined, graded: boolean): SubmissionState {
  if (graded) {
    return 'graded';
  }
  return submitted ? (submitted.late ? 'late' : 'submitted') : 'missing';
}

async function activeStudents(db: Database, groupId: string): Promise<string[]> {
  const rows = await db
    .select({ id: groupMembers.studentId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, 'active')));
  return rows.map((row) => row.id);
}

async function findAssignment(db: Database, groupId: string, id: string): Promise<AssignmentRow> {
  const [row] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, id), eq(assignments.groupId, groupId)));
  if (!row) {
    throw new HttpError(404, 'NOT_FOUND', 'Assignment not found');
  }
  return row;
}

async function submissionsWithFiles(
  db: Database,
  assignmentIds: string[],
  studentId?: string,
): Promise<Map<string, Submission & { studentId: string; assignmentId: string }>> {
  if (assignmentIds.length === 0) {
    return new Map();
  }
  const [rows, fileRows] = await Promise.all([
    db
      .select()
      .from(submissions)
      .where(
        and(
          inArray(submissions.assignmentId, assignmentIds),
          studentId ? eq(submissions.studentId, studentId) : undefined,
        ),
      ),
    db
      .select({
        assignmentId: submissionFiles.assignmentId,
        studentId: submissionFiles.studentId,
        file: files,
      })
      .from(submissionFiles)
      .innerJoin(files, eq(files.id, submissionFiles.fileId))
      .where(
        and(
          inArray(submissionFiles.assignmentId, assignmentIds),
          studentId ? eq(submissionFiles.studentId, studentId) : undefined,
        ),
      )
      .orderBy(asc(submissionFiles.position)),
  ]);
  const key = (assignmentId: string, student: string) => `${assignmentId}:${student}`;
  const filesBy = new Map<string, Attachment[]>();
  for (const row of fileRows) {
    const list = filesBy.get(key(row.assignmentId, row.studentId)) ?? [];
    list.push(toAttachment(row.file));
    filesBy.set(key(row.assignmentId, row.studentId), list);
  }
  return new Map(
    rows.map((row) => [
      key(row.assignmentId, row.studentId),
      {
        assignmentId: row.assignmentId,
        studentId: row.studentId,
        body: row.body,
        files: filesBy.get(key(row.assignmentId, row.studentId)) ?? [],
        submittedAt: row.submittedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        late: row.late,
      },
    ]),
  );
}

function withoutKeys(entry: Submission & { studentId: string; assignmentId: string }): Submission {
  const { body, files: attached, submittedAt, updatedAt, late } = entry;
  return { body, files: attached, submittedAt, updatedAt, late };
}

async function toAssignments(
  db: Database,
  access: GroupAccess,
  user: User,
  rows: AssignmentRow[],
  now: Date,
): Promise<Assignment[]> {
  if (rows.length === 0) {
    return [];
  }
  const ids = rows.map((row) => row.id);
  const columnIds = rows.map((row) => row.columnId);
  const staff = access.can.teach;
  const [attachmentRows, columnRows, authors, students, handedIn, gradeRows] = await Promise.all([
    db
      .select({ assignmentId: assignmentAttachments.assignmentId, file: files })
      .from(assignmentAttachments)
      .innerJoin(files, eq(files.id, assignmentAttachments.fileId))
      .where(inArray(assignmentAttachments.assignmentId, ids))
      .orderBy(asc(assignmentAttachments.position)),
    db.select().from(gradeColumns).where(inArray(gradeColumns.id, columnIds)),
    namesOf(db, [...new Set(rows.map((row) => row.authorId))]),
    staff ? activeStudents(db, access.group.id) : Promise.resolve([]),
    submissionsWithFiles(db, ids, staff ? undefined : user.id),
    db
      .select()
      .from(grades)
      .where(
        and(inArray(grades.columnId, columnIds), staff ? undefined : eq(grades.studentId, user.id)),
      ),
  ]);
  const columnBy = new Map<string, GradeColumnRow>(columnRows.map((row) => [row.id, row]));
  const active = new Set(students);

  return rows.map((row) => {
    const column = columnBy.get(row.columnId);
    const accepting = acceptingNow(access, row, now);
    const mineSubmission = handedIn.get(`${row.id}:${user.id}`);
    const mineGrade = gradeRows.find(
      (grade) => grade.columnId === row.columnId && grade.studentId === user.id,
    );
    const released = column?.published ?? false;
    return {
      id: row.id,
      title: row.title,
      instructions: row.instructions,
      kind: row.kind,
      maxScore: column?.maxScore ?? 0,
      dueAt: row.dueAt?.toISOString() ?? null,
      allowLate: row.allowLate,
      closed: row.closedAt !== null,
      accepting,
      attachments: attachmentRows
        .filter((attachment) => attachment.assignmentId === row.id)
        .map((attachment) => toAttachment(attachment.file)),
      author: { id: row.authorId, name: authors.get(row.authorId)?.name ?? '' },
      createdAt: row.createdAt.toISOString(),
      edited: row.editedAt !== null,
      columnId: row.columnId,
      mine: staff
        ? null
        : {
            state: stateOf(mineSubmission, released && mineGrade !== undefined),
            submission: mineSubmission ? withoutKeys(mineSubmission) : null,
            grade: released ? toGradeInput(mineGrade) : null,
            // Once the doctor has graded it, the work stays as it was graded.
            canSubmit: accepting && mineGrade === undefined,
          },
      progress: staff
        ? {
            students: active.size,
            submitted: [...handedIn.values()].filter(
              (entry) => entry.assignmentId === row.id && active.has(entry.studentId),
            ).length,
            graded: gradeRows.filter(
              (grade) => grade.columnId === row.columnId && active.has(grade.studentId),
            ).length,
            released,
          }
        : null,
    };
  });
}

export async function listAssignments(
  context: ChatContext,
  user: User,
  groupId: string,
): Promise<Assignment[]> {
  const { db, now } = context;
  const access = await groupAccess(db, user, groupId);
  const rows = await db
    .select()
    .from(assignments)
    .where(eq(assignments.groupId, access.group.id))
    .orderBy(desc(assignments.createdAt));
  return toAssignments(db, access, user, rows, now());
}

async function oneAssignment(
  context: ChatContext,
  access: GroupAccess,
  user: User,
  row: AssignmentRow,
): Promise<Assignment> {
  const [assignment] = await toAssignments(context.db, access, user, [row], context.now());
  if (!assignment) {
    throw new HttpError(404, 'NOT_FOUND', 'Assignment not found');
  }
  return assignment;
}

/** The staff's view of one assignment: every student of the group with what they handed in. */
export async function assignmentDetail(
  context: ChatContext,
  user: User,
  groupId: string,
  assignmentId: string,
): Promise<AssignmentDetail> {
  const { db } = context;
  const access = await groupAccess(db, user, groupId);
  assertCan(access, 'teach');
  const row = await findAssignment(db, access.group.id, assignmentId);
  const [students, handedIn, gradeRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
        avatarFileId: users.avatarFileId,
        universityId: studentProfiles.universityId,
      })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.studentId))
      .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .where(and(eq(groupMembers.groupId, access.group.id), eq(groupMembers.status, 'active')))
      .orderBy(asc(users.name)),
    submissionsWithFiles(db, [row.id]),
    db.select().from(grades).where(eq(grades.columnId, row.columnId)),
  ]);
  const gradeBy = new Map(gradeRows.map((grade) => [grade.studentId, grade]));

  const list: SubmissionRow[] = students.map((student) => {
    const submission = handedIn.get(`${row.id}:${student.id}`);
    const grade = gradeBy.get(student.id);
    return {
      student: {
        id: student.id,
        name: student.name,
        avatarUrl: avatarUrlOf(student),
        universityId: student.universityId ?? null,
      },
      state: stateOf(submission, grade !== undefined),
      submission: submission ? withoutKeys(submission) : null,
      grade: toGradeInput(grade),
    };
  });
  return { assignment: await oneAssignment(context, access, user, row), submissions: list };
}

async function saveUploads(
  context: ChatContext,
  user: User,
  uploads: Upload[],
  purpose: 'chat' | 'submission',
  groupId: string,
) {
  const saved = [];
  try {
    for (const upload of uploads) {
      saved.push(await saveUpload(context, user, upload, purpose, groupId));
    }
  } catch (error) {
    // Nothing half-saved is left behind when one file is refused.
    for (const file of saved) {
      await removeFile(context, file.id);
    }
    throw error;
  }
  return saved;
}

/**
 * Creates an assignment and the gradebook column its scores go in. The column starts hidden: the
 * doctor releases the grades when they are ready.
 */
export async function createAssignment(
  context: ChatContext,
  user: User,
  groupId: string,
  input: AssignmentInput,
  uploads: Upload[],
): Promise<Assignment> {
  const { db, now } = context;
  const access = await groupAccess(db, user, groupId);
  assertCan(access, 'teach');
  assertNotArchived(access);
  if (uploads.length > ASSIGNMENT_MAX_FILES) {
    throw tooManyFiles(ASSIGNMENT_MAX_FILES);
  }
  if (input.dueAt && new Date(input.dueAt) <= now()) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'The deadline must be in the future', {
      fields: { dueAt: 'past' },
    });
  }
  const saved = await saveUploads(context, user, uploads, 'chat', access.group.id);

  let row: AssignmentRow | undefined;
  try {
    row = await db.transaction(async (tx) => {
      const [last] = await tx
        .select({ position: max(gradeColumns.position) })
        .from(gradeColumns)
        .where(eq(gradeColumns.groupId, access.group.id));
      const [column] = await tx
        .insert(gradeColumns)
        .values({
          groupId: access.group.id,
          title: input.title,
          kind: input.kind,
          maxScore: input.maxScore,
          weight: null,
          heldOn: input.dueAt ? input.dueAt.slice(0, 10) : null,
          published: false,
          position: (last?.position ?? -1) + 1,
          source: 'assignment',
          createdAt: now(),
        })
        .returning();
      if (!column) {
        throw new Error('Column was not created');
      }
      const [created] = await tx
        .insert(assignments)
        .values({
          groupId: access.group.id,
          authorId: user.id,
          columnId: column.id,
          kind: input.kind,
          title: input.title,
          instructions: input.instructions,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          allowLate: input.allowLate,
          createdAt: now(),
        })
        .returning();
      if (!created) {
        throw new Error('Assignment was not created');
      }
      if (saved.length > 0) {
        await tx.insert(assignmentAttachments).values(
          saved.map((file, position) => ({
            assignmentId: created.id,
            fileId: file.id,
            position,
          })),
        );
      }
      return created;
    });
  } catch (error) {
    for (const file of saved) {
      await removeFile(context, file.id);
    }
    throw error;
  }

  const authorName = (await namesOf(db, [user.id])).get(user.id)?.name ?? user.name;
  await notify(notifyContext(context), {
    kind: 'assignment',
    groupId: access.group.id,
    groupName: access.group.name,
    actor: { id: user.id, name: authorName },
    recipients: await activeStudents(db, access.group.id),
    assignmentId: row.id,
    excerpt: row.title,
  });
  return oneAssignment(context, access, user, row);
}

export async function updateAssignment(
  context: ChatContext,
  user: User,
  groupId: string,
  assignmentId: string,
  changes: AssignmentUpdate,
  uploads: Upload[],
): Promise<Assignment> {
  const { db, now } = context;
  const access = await groupAccess(db, user, groupId);
  assertCan(access, 'teach');
  assertNotArchived(access);
  const row = await findAssignment(db, access.group.id, assignmentId);

  const current = await db
    .select({ fileId: assignmentAttachments.fileId })
    .from(assignmentAttachments)
    .where(eq(assignmentAttachments.assignmentId, row.id));
  const keep = changes.keepFileIds
    ? current.filter((file) => changes.keepFileIds?.includes(file.fileId))
    : current;
  if (keep.length + uploads.length > ASSIGNMENT_MAX_FILES) {
    throw tooManyFiles(ASSIGNMENT_MAX_FILES);
  }
  if (changes.maxScore !== undefined) {
    const [highest] = await db
      .select({ score: max(grades.score) })
      .from(grades)
      .where(eq(grades.columnId, row.columnId));
    if ((highest?.score ?? 0) > changes.maxScore) {
      throw new HttpError(409, 'SCORE_TOO_HIGH', 'Some scores are above the new maximum');
    }
  }
  const saved = await saveUploads(context, user, uploads, 'chat', access.group.id);
  const [column] = await db.select().from(gradeColumns).where(eq(gradeColumns.id, row.columnId));
  const releasing = changes.released === true && column?.published === false;

  const dueAt =
    changes.dueAt === undefined ? row.dueAt : changes.dueAt ? new Date(changes.dueAt) : null;
  const [updated] = await db.transaction(async (tx) => {
    await tx
      .update(gradeColumns)
      .set({
        title: changes.title ?? row.title,
        kind: changes.kind ?? row.kind,
        maxScore: changes.maxScore ?? column?.maxScore,
        heldOn: dueAt ? dueAt.toISOString().slice(0, 10) : null,
        published: changes.released ?? column?.published,
      })
      .where(eq(gradeColumns.id, row.columnId));
    const removed = current.filter((file) => !keep.includes(file));
    if (removed.length > 0) {
      await tx.delete(assignmentAttachments).where(
        inArray(
          assignmentAttachments.fileId,
          removed.map((file) => file.fileId),
        ),
      );
    }
    if (saved.length > 0) {
      await tx.insert(assignmentAttachments).values(
        saved.map((file, index) => ({
          assignmentId: row.id,
          fileId: file.id,
          position: keep.length + index,
        })),
      );
    }
    const contentChanged =
      changes.title !== undefined ||
      changes.instructions !== undefined ||
      changes.dueAt !== undefined ||
      changes.keepFileIds !== undefined ||
      saved.length > 0;
    return tx
      .update(assignments)
      .set({
        title: changes.title ?? row.title,
        instructions: changes.instructions ?? row.instructions,
        kind: changes.kind ?? row.kind,
        dueAt,
        allowLate: changes.allowLate ?? row.allowLate,
        closedAt:
          changes.closed === undefined
            ? row.closedAt
            : changes.closed
              ? (row.closedAt ?? now())
              : null,
        editedAt: contentChanged ? now() : row.editedAt,
      })
      .where(eq(assignments.id, row.id))
      .returning();
  });
  for (const file of current.filter((entry) => !keep.includes(entry))) {
    await removeFile(context, file.fileId);
  }

  if (releasing) {
    const authorName = (await namesOf(db, [user.id])).get(user.id)?.name ?? user.name;
    await notify(notifyContext(context), {
      kind: 'grade',
      groupId: access.group.id,
      groupName: access.group.name,
      actor: { id: user.id, name: authorName },
      recipients: await activeStudents(db, access.group.id),
      gradeColumnId: row.columnId,
      assignmentId: row.id,
      excerpt: updated?.title ?? row.title,
    });
  }
  return oneAssignment(context, access, user, updated ?? row);
}

/** Removes an assignment with its column, its scores and everything handed in for it. */
export async function deleteAssignment(
  context: ChatContext,
  user: User,
  groupId: string,
  assignmentId: string,
): Promise<void> {
  const { db, now } = context;
  const access = await groupAccess(db, user, groupId);
  assertCan(access, 'teach');
  assertNotArchived(access);
  const row = await findAssignment(db, access.group.id, assignmentId);
  const [attached, handedIn] = await Promise.all([
    db
      .select({ fileId: assignmentAttachments.fileId })
      .from(assignmentAttachments)
      .where(eq(assignmentAttachments.assignmentId, row.id)),
    db
      .select({ fileId: submissionFiles.fileId })
      .from(submissionFiles)
      .where(eq(submissionFiles.assignmentId, row.id)),
  ]);
  // The column goes first: the assignment and its submissions follow it.
  await db.delete(gradeColumns).where(eq(gradeColumns.id, row.columnId));
  for (const file of [...attached, ...handedIn]) {
    await removeFile(context, file.fileId);
  }
  await recordAudit(db, {
    at: now(),
    actorUserId: user.id,
    action: 'assignment.deleted',
    metadata: { groupId: access.group.id, assignmentId: row.id, title: row.title },
    ipAddress: context.ipAddress,
  });
}

async function studentAccess(context: ChatContext, user: User, groupId: string) {
  const access = await groupAccess(context.db, user, groupId);
  if (access.can.teach || user.role !== 'student') {
    throw new HttpError(403, 'FORBIDDEN', 'Only students hand in work');
  }
  return access;
}

/** Hands in a student's work, or replaces what they handed in before, until it is graded. */
export async function submitWork(
  context: ChatContext,
  user: User,
  groupId: string,
  assignmentId: string,
  input: SubmissionInput,
  uploads: Upload[],
): Promise<Assignment> {
  const { db, now } = context;
  const access = await studentAccess(context, user, groupId);
  assertNotArchived(access);
  const row = await findAssignment(db, access.group.id, assignmentId);
  if (!acceptingNow(access, row, now())) {
    throw new HttpError(409, 'ASSIGNMENT_CLOSED', 'This assignment no longer takes work');
  }
  const [graded] = await db
    .select({ studentId: grades.studentId })
    .from(grades)
    .where(and(eq(grades.columnId, row.columnId), eq(grades.studentId, user.id)));
  if (graded) {
    throw new HttpError(409, 'SUBMISSION_LOCKED', 'This work has already been graded');
  }

  const current = await db
    .select({ fileId: submissionFiles.fileId })
    .from(submissionFiles)
    .where(and(eq(submissionFiles.assignmentId, row.id), eq(submissionFiles.studentId, user.id)));
  const keep = current.filter((file) => input.keepFileIds.includes(file.fileId));
  if (keep.length + uploads.length > SUBMISSION_MAX_FILES) {
    throw tooManyFiles(SUBMISSION_MAX_FILES);
  }
  if (input.body === '' && keep.length + uploads.length === 0) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Write an answer or attach a file', {
      fields: { body: 'required' },
    });
  }
  const saved = await saveUploads(context, user, uploads, 'submission', access.group.id);
  const late = row.dueAt !== null && now() > row.dueAt;

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(submissions)
        .values({
          assignmentId: row.id,
          studentId: user.id,
          body: input.body || null,
          submittedAt: now(),
          updatedAt: now(),
          late,
        })
        .onConflictDoUpdate({
          target: [submissions.assignmentId, submissions.studentId],
          set: { body: input.body || null, updatedAt: now(), late },
        });
      const removed = current.filter((file) => !keep.includes(file));
      if (removed.length > 0) {
        await tx.delete(submissionFiles).where(
          inArray(
            submissionFiles.fileId,
            removed.map((file) => file.fileId),
          ),
        );
      }
      if (saved.length > 0) {
        await tx.insert(submissionFiles).values(
          saved.map((file, index) => ({
            assignmentId: row.id,
            studentId: user.id,
            fileId: file.id,
            position: keep.length + index,
          })),
        );
      }
    });
  } catch (error) {
    for (const file of saved) {
      await removeFile(context, file.id);
    }
    throw error;
  }
  for (const file of current.filter((entry) => !keep.includes(entry))) {
    await removeFile(context, file.fileId);
  }
  await markReadFor(db, user.id, { assignmentId: row.id }, now());
  return oneAssignment(context, access, user, row);
}

/** Takes back what a student handed in, while it is not graded and work is still accepted. */
export async function withdrawWork(
  context: ChatContext,
  user: User,
  groupId: string,
  assignmentId: string,
): Promise<Assignment> {
  const { db, now } = context;
  const access = await studentAccess(context, user, groupId);
  assertNotArchived(access);
  const row = await findAssignment(db, access.group.id, assignmentId);
  const [graded] = await db
    .select({ studentId: grades.studentId })
    .from(grades)
    .where(and(eq(grades.columnId, row.columnId), eq(grades.studentId, user.id)));
  if (graded) {
    throw new HttpError(409, 'SUBMISSION_LOCKED', 'This work has already been graded');
  }
  if (!acceptingNow(access, row, now())) {
    throw new HttpError(409, 'ASSIGNMENT_CLOSED', 'This assignment no longer takes work');
  }
  const attached = await db
    .select({ fileId: submissionFiles.fileId })
    .from(submissionFiles)
    .where(and(eq(submissionFiles.assignmentId, row.id), eq(submissionFiles.studentId, user.id)));
  await db
    .delete(submissions)
    .where(and(eq(submissions.assignmentId, row.id), eq(submissions.studentId, user.id)));
  for (const file of attached) {
    await removeFile(context, file.fileId);
  }
  return oneAssignment(context, access, user, row);
}

/**
 * Grades one student's work: the score and the note go into the assignment's gradebook column, so
 * the sheet and the exports show it without anything typed twice. Once the grades are released,
 * the student is told about a new or changed one.
 */
export async function gradeSubmission(
  context: ChatContext,
  user: User,
  groupId: string,
  assignmentId: string,
  studentId: string,
  grade: GradeInput,
): Promise<SubmissionRow> {
  const { db } = context;
  const access = await groupAccess(db, user, groupId);
  assertCan(access, 'teach');
  const row = await findAssignment(db, access.group.id, assignmentId);
  await setGrades(context, user, access.group.id, row.columnId, [{ studentId, ...grade }]);

  const [column] = await db.select().from(gradeColumns).where(eq(gradeColumns.id, row.columnId));
  const cleared = grade.status === 'scored' && grade.score === null && !grade.note;
  if (column?.published && !cleared) {
    const actorName = (await namesOf(db, [user.id])).get(user.id)?.name ?? user.name;
    await notify(notifyContext(context), {
      kind: 'grade',
      groupId: access.group.id,
      groupName: access.group.name,
      actor: { id: user.id, name: actorName },
      recipients: [studentId],
      gradeColumnId: row.columnId,
      assignmentId: row.id,
      excerpt: row.title,
    });
  }
  const detail = await assignmentDetail(context, user, access.group.id, row.id);
  const entry = detail.submissions.find((submission) => submission.student.id === studentId);
  if (!entry) {
    throw new HttpError(404, 'STUDENT_NOT_FOUND', 'Student not found in this group');
  }
  return entry;
}
