import type { GroupPerson, LearningLanguage, Person } from '@acu/shared';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  doctorLanguages,
  doctorProfiles,
  groupAssistants,
  groupMembers,
  groups,
  studentLanguages,
  studentProfiles,
  users,
  type User,
} from '../../db/schema';
import { HttpError } from '../../http/http-error';
import { groupAccess, groupParticipants } from '../groups/access';
import { fileUrl } from '../files/files.service';
import { teachesStudent } from '../groups/groups.service';
import { avatarUrlOf } from '../users/avatar';

const ROLE_ORDER = ['owner', 'assistant', 'moderator', 'representative', 'student'] as const;

/**
 * The doctor first, then the teaching assistants, then the active students: moderators and
 * representatives before the others, each by name. Pending and removed students are not shown.
 */
export async function groupPeople(
  db: Database,
  viewer: User,
  groupId: string,
): Promise<GroupPerson[]> {
  const { group } = await groupAccess(db, viewer, groupId);
  const roles = await groupParticipants(db, group);
  const ids = [...roles.keys()];
  const [people, joined] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        displayName: doctorProfiles.displayName,
        avatarUrl: users.avatarUrl,
        avatarFileId: users.avatarFileId,
      })
      .from(users)
      .leftJoin(doctorProfiles, eq(doctorProfiles.userId, users.id))
      .where(inArray(users.id, ids)),
    db
      .select({ studentId: groupMembers.studentId, joinedAt: groupMembers.joinedAt })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.status, 'active'))),
  ]);
  const joinedAt = new Map(joined.map((row) => [row.studentId, row.joinedAt]));

  return people
    .map((person) => {
      const role = roles.get(person.id) ?? 'student';
      return {
        id: person.id,
        name: person.displayName ?? person.name,
        avatarUrl: avatarUrlOf(person),
        role,
        joinedAt: joinedAt.get(person.id)?.toISOString() ?? null,
        me: person.id === viewer.id,
      };
    })
    .sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name),
    );
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
  const assisted = await db
    .select({ id: groupAssistants.groupId })
    .from(groupAssistants)
    .where(eq(groupAssistants.userId, userId));
  return new Set([...rows, ...assisted].map((row) => row.id));
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
