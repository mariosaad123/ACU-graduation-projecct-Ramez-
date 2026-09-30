import type { SessionUser } from '@acu/shared';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { doctorProfiles, studentProfiles, type User } from '../../db/schema';
import { listStudentLanguages } from '../students/student-languages.service';

export async function toSessionUser(db: Database, user: User): Promise<SessionUser> {
  const [[student], [doctor], languages] = await Promise.all([
    db.select().from(studentProfiles).where(eq(studentProfiles.userId, user.id)),
    db.select().from(doctorProfiles).where(eq(doctorProfiles.userId, user.id)),
    listStudentLanguages(db, user.id),
  ]);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    student: student
      ? { activeLanguage: student.activeLanguage, languages, goal: student.goal }
      : null,
    doctor: doctor
      ? {
          status: doctor.status,
          displayName: doctor.displayName,
          staffId: doctor.staffId,
          universityEmail: doctor.universityEmail,
        }
      : null,
  };
}
