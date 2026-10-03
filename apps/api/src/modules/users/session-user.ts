import type { SessionUser } from '@acu/shared';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { doctorProfiles, studentProfiles, type User } from '../../db/schema';
import { listDoctorLanguages } from '../doctors/doctor-languages.service';
import { listStudentLanguages } from '../students/student-languages.service';
import { avatarUrlOf } from './avatar';

export async function toSessionUser(db: Database, user: User): Promise<SessionUser> {
  const [[student], [doctor], studentLanguages, doctorLanguages] = await Promise.all([
    db.select().from(studentProfiles).where(eq(studentProfiles.userId, user.id)),
    db.select().from(doctorProfiles).where(eq(doctorProfiles.userId, user.id)),
    listStudentLanguages(db, user.id),
    listDoctorLanguages(db, user.id),
  ]);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: avatarUrlOf(user),
    customAvatar: user.avatarFileId !== null,
    role: user.role,
    student: student
      ? {
          activeLanguage: student.activeLanguage,
          languages: studentLanguages,
          goal: student.goal,
          universityId: student.universityId ?? null,
        }
      : null,
    doctor: doctor
      ? {
          status: doctor.status,
          displayName: doctor.displayName,
          staffId: doctor.staffId,
          universityEmail: doctor.universityEmail,
          languages: doctorLanguages,
        }
      : null,
  };
}
