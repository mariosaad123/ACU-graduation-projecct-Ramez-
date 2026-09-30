import { and, eq } from 'drizzle-orm';
import type { Transaction } from '../../db/client';
import { sessions, users, type User } from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { recordAudit } from '../audit/audit';
import { teachesStudent, type GroupsContext } from './groups.service';

/**
 * A doctor may act only on students who are, or were, in one of their groups. Anyone else looks
 * like an account that does not exist.
 */
async function lockTaughtStudent(tx: Transaction, doctor: User, studentId: string) {
  const [student] = await tx
    .select()
    .from(users)
    .where(and(eq(users.id, studentId), eq(users.role, 'student')))
    .for('update');
  if (!student || !(await teachesStudent(tx, doctor.id, studentId))) {
    throw new HttpError(404, 'STUDENT_NOT_FOUND', 'Student not found');
  }
  return student;
}

/**
 * Suspends the whole account: the student is signed out everywhere and cannot sign in again
 * until the same doctor, or the faculty administration, lifts it.
 */
export async function suspendStudent(
  context: GroupsContext,
  doctor: User,
  studentId: string,
  reason: string,
): Promise<void> {
  const { db, now } = context;

  await db.transaction(async (tx) => {
    const student = await lockTaughtStudent(tx, doctor, studentId);
    if (student.disabledAt) {
      throw new HttpError(409, 'ALREADY_SUSPENDED', 'This account is already suspended');
    }
    await tx
      .update(users)
      .set({
        disabledAt: now(),
        suspendedByUserId: doctor.id,
        suspensionReason: reason,
        updatedAt: now(),
      })
      .where(eq(users.id, studentId));
    await tx.delete(sessions).where(eq(sessions.userId, studentId));
  });

  await recordAudit(db, {
    at: now(),
    actorUserId: doctor.id,
    action: 'student.suspended',
    metadata: { studentId, reason },
    ipAddress: context.ipAddress,
  });
}

/** Only the doctor who suspended the account lifts it; otherwise it is the administration's. */
export async function unsuspendStudent(
  context: GroupsContext,
  doctor: User,
  studentId: string,
): Promise<void> {
  const { db, now } = context;

  const lifted = await db.transaction(async (tx) => {
    const student = await lockTaughtStudent(tx, doctor, studentId);
    if (!student.disabledAt) {
      return false;
    }
    if (student.suspendedByUserId !== doctor.id) {
      throw new HttpError(403, 'NOT_SUSPENDER', 'Only whoever suspended this account can lift it');
    }
    await tx
      .update(users)
      .set({ disabledAt: null, suspendedByUserId: null, suspensionReason: null, updatedAt: now() })
      .where(eq(users.id, studentId));
    return true;
  });

  if (lifted) {
    await recordAudit(db, {
      at: now(),
      actorUserId: doctor.id,
      action: 'student.unsuspended',
      metadata: { studentId },
      ipAddress: context.ipAddress,
    });
  }
}
