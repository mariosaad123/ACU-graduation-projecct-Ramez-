import type { LearningLanguage } from '@acu/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../db/client';
import { studentLanguages, studentProfiles, type User } from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { recordAudit } from '../audit/audit';

export interface StudentLanguagesContext {
  db: Database;
  now: () => Date;
  ipAddress: string | undefined;
}

/** Oldest first; languages added together keep the platform's language order. */
export async function listStudentLanguages(
  db: Database | Transaction,
  userId: string,
): Promise<LearningLanguage[]> {
  const rows = await db
    .select({ language: studentLanguages.language })
    .from(studentLanguages)
    .where(eq(studentLanguages.userId, userId))
    .orderBy(asc(studentLanguages.enrolledAt), asc(studentLanguages.language));
  return rows.map((row) => row.language);
}

/**
 * Locks the student's profile row for the rest of the transaction, so two requests from the same
 * student (two tabs, a double click) cannot both pass a check such as "not the last language".
 */
async function lockProfile(tx: Transaction, userId: string) {
  const [profile] = await tx
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .for('update');
  if (!profile) {
    throw new HttpError(403, 'FORBIDDEN', 'Your account cannot do this');
  }
  return profile;
}

function notAdded(language: LearningLanguage): HttpError {
  return new HttpError(404, 'LANGUAGE_NOT_ADDED', 'You are not learning this language', {
    details: { language },
  });
}

/** Adds a language and makes it the active one: adding a language is choosing to start it. */
export async function addStudentLanguage(
  context: StudentLanguagesContext,
  user: User,
  language: LearningLanguage,
): Promise<void> {
  const { db, now } = context;

  await db.transaction(async (tx) => {
    await lockProfile(tx, user.id);
    const inserted = await tx
      .insert(studentLanguages)
      .values({ userId: user.id, language, enrolledAt: now() })
      .onConflictDoNothing()
      .returning({ language: studentLanguages.language });
    if (inserted.length === 0) {
      throw new HttpError(409, 'LANGUAGE_ALREADY_ADDED', 'You are already learning this language', {
        details: { language },
      });
    }
    await tx
      .update(studentProfiles)
      .set({ activeLanguage: language, updatedAt: now() })
      .where(eq(studentProfiles.userId, user.id));
  });

  await recordAudit(db, {
    at: now(),
    actorUserId: user.id,
    action: 'student.language_added',
    metadata: { language },
    ipAddress: context.ipAddress,
  });
}

export async function switchActiveLanguage(
  context: StudentLanguagesContext,
  user: User,
  language: LearningLanguage,
): Promise<void> {
  const { db, now } = context;

  await db.transaction(async (tx) => {
    const profile = await lockProfile(tx, user.id);
    if (profile.activeLanguage === language) {
      return;
    }
    const languages = await listStudentLanguages(tx, user.id);
    if (!languages.includes(language)) {
      throw notAdded(language);
    }
    await tx
      .update(studentProfiles)
      .set({ activeLanguage: language, updatedAt: now() })
      .where(eq(studentProfiles.userId, user.id));
  });
}

/**
 * Removes a language the student no longer wants. The last one cannot go. Removing the active
 * language makes the student's first remaining language active.
 */
export async function removeStudentLanguage(
  context: StudentLanguagesContext,
  user: User,
  language: LearningLanguage,
): Promise<void> {
  const { db, now } = context;

  await db.transaction(async (tx) => {
    const profile = await lockProfile(tx, user.id);
    const languages = await listStudentLanguages(tx, user.id);
    if (!languages.includes(language)) {
      throw notAdded(language);
    }
    const remaining = languages.filter((candidate) => candidate !== language);
    const [fallback] = remaining;
    if (!fallback) {
      throw new HttpError(409, 'LAST_LANGUAGE', 'A student keeps at least one language');
    }

    // The profile must point elsewhere first: the active language cannot be deleted under it.
    if (profile.activeLanguage === language) {
      await tx
        .update(studentProfiles)
        .set({ activeLanguage: fallback, updatedAt: now() })
        .where(eq(studentProfiles.userId, user.id));
    }
    await tx
      .delete(studentLanguages)
      .where(and(eq(studentLanguages.userId, user.id), eq(studentLanguages.language, language)));
  });

  await recordAudit(db, {
    at: now(),
    actorUserId: user.id,
    action: 'student.language_removed',
    metadata: { language },
    ipAddress: context.ipAddress,
  });
}
