import type { LearningLanguage } from '@acu/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Database, Transaction } from '../../db/client';
import { foreignKeyViolation } from '../../db/errors';
import { doctorLanguages, groups, type User } from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { recordAudit } from '../audit/audit';

/** Oldest first; languages added together keep the platform's language order. */
export async function listDoctorLanguages(
  db: Database | Transaction,
  userId: string,
): Promise<LearningLanguage[]> {
  const rows = await db
    .select({ language: doctorLanguages.language })
    .from(doctorLanguages)
    .where(eq(doctorLanguages.userId, userId))
    .orderBy(asc(doctorLanguages.createdAt), asc(doctorLanguages.language));
  return rows.map((row) => row.language);
}

/**
 * Makes the doctor's languages exactly `languages`. A language that still has groups, archived
 * or not, cannot be dropped: the groups are in it.
 */
export async function replaceDoctorLanguages(
  tx: Transaction,
  userId: string,
  languages: readonly LearningLanguage[],
  at: Date,
): Promise<void> {
  const current = await listDoctorLanguages(tx, userId);
  const dropped = current.filter((language) => !languages.includes(language));

  if (dropped.length > 0) {
    const inUse = await tx
      .selectDistinct({ language: groups.language })
      .from(groups)
      .where(and(eq(groups.doctorId, userId), inArray(groups.language, dropped)));
    if (inUse.length > 0) {
      throw new HttpError(409, 'LANGUAGE_IN_USE', 'You still have groups in this language', {
        details: { languages: inUse.map((row) => row.language) },
      });
    }
    await tx
      .delete(doctorLanguages)
      .where(and(eq(doctorLanguages.userId, userId), inArray(doctorLanguages.language, dropped)));
  }

  const added = languages.filter((language) => !current.includes(language));
  if (added.length > 0) {
    await tx
      .insert(doctorLanguages)
      .values(added.map((language) => ({ userId, language, createdAt: at })))
      .onConflictDoNothing();
  }
}

export async function updateDoctorLanguages(
  context: { db: Database; now: () => Date; ipAddress: string | undefined },
  doctor: User,
  languages: readonly LearningLanguage[],
): Promise<void> {
  const { db, now } = context;
  try {
    await db.transaction(async (tx) => {
      await replaceDoctorLanguages(tx, doctor.id, languages, now());
    });
  } catch (error) {
    // A group created in a dropped language between the check and the delete.
    if (foreignKeyViolation(error) === 'groups_doctor_language_fk') {
      throw new HttpError(409, 'LANGUAGE_IN_USE', 'You still have groups in this language');
    }
    throw error;
  }
  await recordAudit(db, {
    at: now(),
    actorUserId: doctor.id,
    action: 'doctor.languages_changed',
    metadata: { languages },
    ipAddress: context.ipAddress,
  });
}
