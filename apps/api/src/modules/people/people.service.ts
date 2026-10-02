import type { GroupPerson, LearningLanguage, Person } from '@acu/shared';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  doctorLanguages,
  doctorProfiles,
  groupMembers,
  groups,
  studentLanguages,
  studentProfiles,
  users,
  type User,
} from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { accessOf } from '../chat/chat.service';
import { fileUrl } from '../files/files.service';
import { teachesStudent } from '../groups/groups.service';
import { avatarUrlOf } from '../users/avatar';

/** The group's doctor first, then its active students by name. Pending and removed are not shown. */
export async function groupPeople(
  db: Database,
  viewer: User,
  groupId: string,
): Promise<GroupPerson[]> {
  const { group } = await accessOf(db, viewer, groupId);

  const [doctor] = await db
    .select({
      id: users.id,
      name: doctorProfiles.displayName,
      avatarUrl: users.avatarUrl,
      avatarFileId: users.avatarFileId,
    })
    .from(users)
    .innerJoin(doctorProfiles, eq(doctorProfiles.userId, users.id))
    .where(eq(users.id, group.doctorId));

  const students = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      avatarFileId: users.avatarFileId,
      joinedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.studentId))
    .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.status, 'active')))
    .orderBy(asc(users.name));

  const people: GroupPerson[] = students.map((student) => ({
    id: student.id,
    name: student.name,
    avatarUrl: avatarUrlOf(student),
    role: 'student',
    joinedAt: student.joinedAt.toISOString(),
    me: student.id === viewer.id,
  }));
  if (doctor) {
    people.unshift({
      id: doctor.id,
      name: doctor.name,
      avatarUrl: avatarUrlOf(doctor),
      role: 'doctor',
      joinedAt: null,
      me: doctor.id === viewer.id,
    });
  }
  return people;
}

/** Groups someone takes part in: the ones they teach, and the ones they are an active member of. */
async function groupIdsOf(db: Database, userId: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ id: groups.id })
    .from(groups)
    .leftJoin(
      groupMembers,
      and(
        eq(groupMembers.groupId, groups.id),
        eq(groupMembers.studentId, userId),
        eq(groupMembers.status, 'active'),
      ),
    )
    .where(or(eq(groups.doctorId, userId), eq(groupMembers.studentId, userId)));
  return new Set(rows.map((row) => row.id));
}

async function languagesOf(db: Database, person: User): Promise<LearningLanguage[]> {
  const table = person.role === 'doctor' ? doctorLanguages : studentLanguages;
  const rows = await db
    .select({ language: table.language })
    .from(table)
    .where(eq(table.userId, person.id))
    .orderBy(asc(table.language));
  return rows.map((row) => row.language);
}

/**
 * Someone's profile. It is visible to the people who share a group with them, and to a doctor for
 * any student who is or was in one of their groups. Anyone else gets the same answer as for a
 * person who does not exist.
 */
export async function personProfile(db: Database, viewer: User, personId: string): Promise<Person> {
  const [person] = await db.select().from(users).where(eq(users.id, personId));
  if (!person || (person.role !== 'student' && person.role !== 'doctor')) {
    throw new HttpError(404, 'NOT_FOUND', 'Person not found');
  }

  const me = person.id === viewer.id;
  const [mine, theirs] = await Promise.all([groupIdsOf(db, viewer.id), groupIdsOf(db, person.id)]);
  const shared = [...mine].filter((id) => theirs.has(id));
  const theirDoctor =
    viewer.role === 'doctor' &&
    person.role === 'student' &&
    (await teachesStudent(db, viewer.id, person.id));
  if (!me && shared.length === 0 && !theirDoctor) {
    throw new HttpError(404, 'NOT_FOUND', 'Person not found');
  }

  const [doctor] =
    person.role === 'doctor'
      ? await db.select().from(doctorProfiles).where(eq(doctorProfiles.userId, person.id))
      : [];
  const [student] =
    person.role === 'student'
      ? await db.select().from(studentProfiles).where(eq(studentProfiles.userId, person.id))
      : [];
  const sharedGroups =
    shared.length === 0
      ? []
      : await db
          .select({
            id: groups.id,
            name: groups.name,
            language: groups.language,
            photoFileId: groups.photoFileId,
          })
          .from(groups)
          .where(inArray(groups.id, shared))
          .orderBy(asc(groups.name));

  return {
    id: person.id,
    name: doctor?.displayName ?? person.name,
    avatarUrl: avatarUrlOf(person),
    role: person.role,
    email: doctor ? doctor.universityEmail : me || theirDoctor ? person.email : null,
    languages: await languagesOf(db, person),
    activeLanguage: student?.activeLanguage ?? null,
    memberSince: person.createdAt.toISOString(),
    sharedGroups: sharedGroups.map((group) => ({
      id: group.id,
      name: group.name,
      language: group.language,
      photoUrl: group.photoFileId ? fileUrl(group.photoFileId) : null,
    })),
    me,
  };
}
