import {
  groupMemberResponseSchema,
  groupMembersResponseSchema,
  groupResponseSchema,
  groupsResponseSchema,
  joinPreviewSchema,
  joinResultSchema,
  meResponseSchema,
  normalizeJoinCode,
  studentGroupsResponseSchema,
} from '@acu/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DOCTOR_CODE,
  WEB_ORIGIN,
  createTestContext,
  identity,
  post,
  setDoctorCode,
  signIn,
  type TestContext,
} from '../../test/harness';
import {
  createGroup,
  errorOf,
  idOf,
  me,
  send,
  signInAsDoctor,
  signInAsStudent,
  type Person,
} from '../../test/people';
import { JOIN_CODE_FAILURE_LIMIT } from './membership.service';

let context: TestContext;

beforeAll(async () => {
  context = await createTestContext();
  await setDoctorCode(context);
});

afterAll(async () => {
  await context.close();
});

/** Each step happens a minute after the previous one, as it would for real people. */
function later(): void {
  context.advance(60 * 1000);
}

function join(student: Person, code: string) {
  later();
  return post(student.agent, '/api/student/join', { code });
}

async function members(doctor: Person, groupId: string) {
  const response = await doctor.agent.get(`/api/doctor/groups/${groupId}/members`).expect(200);
  return groupMembersResponseSchema.parse(response.body).members;
}

function memberAction(doctor: Person, groupId: string, studentId: string, action: string) {
  later();
  return post(doctor.agent, `/api/doctor/groups/${groupId}/members/${studentId}/${action}`);
}

describe('languages a doctor teaches', () => {
  it('are chosen at sign-up and shown on the account', async () => {
    const doctor = await signInAsDoctor(context, ['fr', 'de']);

    expect((await me(doctor.agent)).doctor?.languages).toEqual(['fr', 'de']);
  });

  it('can change, but not drop a language that still has groups', async () => {
    const doctor = await signInAsDoctor(context, ['fr']);
    await createGroup(doctor);

    const added = await send(doctor.agent, 'put', '/api/doctor/languages', {
      languages: ['fr', 'ja'],
    }).expect(200);
    expect(meResponseSchema.parse(added.body).user.doctor?.languages).toEqual(['fr', 'ja']);

    const dropped = await send(doctor.agent, 'put', '/api/doctor/languages', {
      languages: ['ja'],
    }).expect(409);
    expect(errorOf(dropped).code).toBe('LANGUAGE_IN_USE');
    expect((await me(doctor.agent)).doctor?.languages).toEqual(['fr', 'ja']);
  });

  it('are gone when someone who started as a doctor becomes a student', async () => {
    const { agent } = await signIn(context);
    await post(agent, '/api/onboarding/doctor', {
      accessCode: DOCTOR_CODE,
      staffId: 'ACU-SWITCH',
      displayName: 'Changed Mind',
      languages: ['de'],
      universityEmail: 'changed.mind@acu.edu.eg',
    }).expect(200);
    await post(agent, '/api/onboarding/student', {
      languages: ['en'],
      activeLanguage: 'en',
      goal: 'study',
    }).expect(200);

    expect((await me(agent)).doctor).toBeNull();
  });
});

describe('who may use the group endpoints', () => {
  it('keeps students out of the doctor endpoints, and doctors out of the student ones', async () => {
    const student = await signInAsStudent(context);
    const doctor = await signInAsDoctor(context);

    expect(errorOf(await student.agent.get('/api/doctor/groups')).code).toBe('FORBIDDEN');
    expect(errorOf(await doctor.agent.get('/api/student/groups')).code).toBe('FORBIDDEN');
    expect(errorOf(await join(doctor, 'K7QM9XRT')).code).toBe('FORBIDDEN');
  });

  it('hides one doctor’s groups from another entirely', async () => {
    const owner = await signInAsDoctor(context);
    const other = await signInAsDoctor(context);
    const group = await createGroup(owner);

    const listed = groupsResponseSchema.parse((await other.agent.get('/api/doctor/groups')).body);
    expect(listed.groups).toEqual([]);
    for (const request of [
      other.agent.get(`/api/doctor/groups/${group.id}/members`),
      send(other.agent, 'patch', `/api/doctor/groups/${group.id}`, { name: 'Taken over' }),
      post(other.agent, `/api/doctor/groups/${group.id}/code`),
      post(other.agent, `/api/doctor/groups/${group.id}/archive`),
    ]) {
      expect(errorOf(await request.expect(404)).code).toBe('NOT_FOUND');
    }
  });

  it('treats malformed ids and unknown actions as missing', async () => {
    const doctor = await signInAsDoctor(context);
    const group = await createGroup(doctor);

    await doctor.agent.get('/api/doctor/groups/not-a-uuid/members').expect(404);
    await memberAction(doctor, group.id, doctor.id, 'promote').expect(404);
  });
});

describe('creating and managing groups', () => {
  it('creates a group with a readable code and no members', async () => {
    const doctor = await signInAsDoctor(context);
    const group = await createGroup(doctor, { name: '  Grammar 1  ', description: '' });

    expect(group).toMatchObject({
      name: 'Grammar 1',
      description: null,
      language: 'fr',
      joinOpen: true,
      requiresApproval: false,
      archived: false,
      counts: { active: 0, pending: 0, out: 0 },
    });
    expect(normalizeJoinCode(group.joinCode)).toBe(group.joinCode);
  });

  it('can require approval from the start', async () => {
    const doctor = await signInAsDoctor(context);
    const group = await createGroup(doctor, { requiresApproval: true });

    expect(group.requiresApproval).toBe(true);
  });

  it('only in a language the doctor teaches', async () => {
    const doctor = await signInAsDoctor(context, ['fr']);
    const response = await post(doctor.agent, '/api/doctor/groups', {
      name: 'Deutsch 1',
      language: 'de',
    }).expect(400);

    expect(errorOf(response).code).toBe('VALIDATION_FAILED');
  });

  it('updates the settings, but never the language', async () => {
    const doctor = await signInAsDoctor(context);
    const group = await createGroup(doctor);

    const response = await send(doctor.agent, 'patch', `/api/doctor/groups/${group.id}`, {
      name: 'Conversation 3',
      joinOpen: false,
      requiresApproval: true,
      language: 'de',
    }).expect(200);

    expect(groupResponseSchema.parse(response.body).group).toMatchObject({
      name: 'Conversation 3',
      joinOpen: false,
      requiresApproval: true,
      language: 'fr',
    });
  });

  it('replaces the code, and the old one stops working', async () => {
    const doctor = await signInAsDoctor(context);
    const student = await signInAsStudent(context);
    const group = await createGroup(doctor);

    const response = await post(doctor.agent, `/api/doctor/groups/${group.id}/code`).expect(200);
    const renewed = groupResponseSchema.parse(response.body).group;

    expect(renewed.joinCode).not.toBe(group.joinCode);
    expect(errorOf(await join(student, group.joinCode).expect(404)).code).toBe('INVALID_JOIN_CODE');
    await join(student, renewed.joinCode).expect(201);
  });

  it('archives a group read-only, and restores it', async () => {
    const doctor = await signInAsDoctor(context);
    const group = await createGroup(doctor);

    const archived = await post(doctor.agent, `/api/doctor/groups/${group.id}/archive`).expect(200);
    expect(groupResponseSchema.parse(archived.body).group.archived).toBe(true);
    const edit = await send(doctor.agent, 'patch', `/api/doctor/groups/${group.id}`, {
      name: 'Too late',
    }).expect(409);
    expect(errorOf(edit).code).toBe('GROUP_ARCHIVED');

    const restored = await post(doctor.agent, `/api/doctor/groups/${group.id}/restore`).expect(200);
    expect(groupResponseSchema.parse(restored.body).group.archived).toBe(false);
  });

  it('lists groups in use before archived ones, with their counts', async () => {
    const doctor = await signInAsDoctor(context);
    const student = await signInAsStudent(context);
    const old = await createGroup(doctor, { name: 'Last term' });
    const current = await createGroup(doctor, { name: 'This term' });
    await join(student, current.joinCode).expect(201);
    await post(doctor.agent, `/api/doctor/groups/${old.id}/archive`).expect(200);

    const { groups } = groupsResponseSchema.parse(
      (await doctor.agent.get('/api/doctor/groups')).body,
    );
    expect(groups.map((group) => group.name)).toEqual(['This term', 'Last term']);
    expect(groups[0]?.counts).toEqual({ active: 1, pending: 0, out: 0 });
  });
});

describe('joining a group', () => {
  it('shows the group before joining, then joins and adds its language', async () => {
    const doctor = await signInAsDoctor(context, ['fr']);
    const student = await signInAsStudent(context, ['en']);
    const group = await createGroup(doctor, { description: 'Mondays 10:00' });

    const preview = joinPreviewSchema.parse(
      (
        await post(student.agent, '/api/student/join/preview', {
          code: group.joinCode.toLowerCase().replace(/^(.{4})/, '$1-'),
        }).expect(200)
      ).body,
    );
    expect(preview).toEqual({
      group: {
        name: 'Conversation 2',
        description: 'Mondays 10:00',
        language: 'fr',
        photoUrl: null,
        doctorName: expect.stringMatching(/^Dr\. Group/) as string,
        doctorAvatarUrl: null,
        requiresApproval: false,
      },
      membership: null,
    });

    const result = joinResultSchema.parse((await join(student, group.joinCode).expect(201)).body);
    expect(result.status).toBe('active');
    expect(result.languageAdded).toBe(true);
    expect(result.user.student).toMatchObject({ activeLanguage: 'en', languages: ['en', 'fr'] });

    const mine = studentGroupsResponseSchema.parse(
      (await student.agent.get('/api/student/groups')).body,
    );
    expect(mine.groups).toMatchObject([{ id: group.id, status: 'active', language: 'fr' }]);
  });

  it('does not add a language the student already has', async () => {
    const doctor = await signInAsDoctor(context, ['fr']);
    const student = await signInAsStudent(context, ['fr']);
    const group = await createGroup(doctor);

    const result = joinResultSchema.parse((await join(student, group.joinCode).expect(201)).body);
    expect(result.languageAdded).toBe(false);
  });

  it('refuses to join twice', async () => {
    const doctor = await signInAsDoctor(context);
    const student = await signInAsStudent(context);
    const group = await createGroup(doctor);
    await join(student, group.joinCode).expect(201);

    expect(errorOf(await join(student, group.joinCode).expect(409)).code).toBe('ALREADY_MEMBER');
  });

  it('waits for the doctor when the group requires approval', async () => {
    const doctor = await signInAsDoctor(context, ['de']);
    const student = await signInAsStudent(context, ['en']);
    const group = await createGroup(doctor, { language: 'de' });
    await send(doctor.agent, 'patch', `/api/doctor/groups/${group.id}`, {
      requiresApproval: true,
    }).expect(200);

    const pending = joinResultSchema.parse((await join(student, group.joinCode).expect(201)).body);
    expect(pending).toMatchObject({ status: 'pending', languageAdded: false });

    const approved = await memberAction(doctor, group.id, student.id, 'approve').expect(200);
    expect(groupMemberResponseSchema.parse(approved.body).member.status).toBe('active');
    expect((await me(student.agent)).student?.languages).toEqual(['en', 'de']);
  });

  it('refuses closed and archived groups', async () => {
    const doctor = await signInAsDoctor(context);
    const student = await signInAsStudent(context);
    const closed = await createGroup(doctor);
    const archived = await createGroup(doctor);
    await send(doctor.agent, 'patch', `/api/doctor/groups/${closed.id}`, {
      joinOpen: false,
    }).expect(200);
    await post(doctor.agent, `/api/doctor/groups/${archived.id}/archive`).expect(200);

    expect(errorOf(await join(student, closed.joinCode).expect(409)).code).toBe('JOIN_CLOSED');
    expect(errorOf(await join(student, archived.joinCode).expect(409)).code).toBe('JOIN_CLOSED');
  });

  it('counts wrong codes and stops guessing after the limit', async () => {
    const student = await signInAsStudent(context);

    const first = await join(student, 'ZZZZ-ZZZZ').expect(404);
    expect(errorOf(first).details?.attemptsLeft).toBe(JOIN_CODE_FAILURE_LIMIT - 1);
    for (let attempt = 1; attempt < JOIN_CODE_FAILURE_LIMIT; attempt += 1) {
      await join(student, 'not a code').expect(404);
    }

    expect(errorOf(await join(student, 'ZZZZ-ZZZZ').expect(429)).code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('lets a student leave, and come back with the code', async () => {
    const doctor = await signInAsDoctor(context);
    const student = await signInAsStudent(context);
    const group = await createGroup(doctor);
    await join(student, group.joinCode).expect(201);

    await post(student.agent, `/api/student/groups/${group.id}/leave`).expect(204);
    const left = await members(doctor, group.id);
    expect(left[0]).toMatchObject({ status: 'left', leftByThemselves: true });

    await join(student, group.joinCode).expect(201);
    expect((await members(doctor, group.id))[0]?.status).toBe('active');
  });

  it('keeps the group’s language while the student is in the group', async () => {
    const doctor = await signInAsDoctor(context, ['fr']);
    const student = await signInAsStudent(context, ['en']);
    const group = await createGroup(doctor);
    await join(student, group.joinCode).expect(201);

    const refused = await student.agent
      .delete('/api/student/languages/fr')
      .set('Origin', WEB_ORIGIN)
      .expect(409);
    expect(errorOf(refused).code).toBe('LANGUAGE_IN_USE');

    await post(student.agent, `/api/student/groups/${group.id}/leave`).expect(204);
    await student.agent.delete('/api/student/languages/fr').set('Origin', WEB_ORIGIN).expect(200);
  });
});

describe('a doctor managing students', () => {
  it('sees each student with their languages', async () => {
    const doctor = await signInAsDoctor(context);
    const student = await signInAsStudent(context, ['ja']);
    const group = await createGroup(doctor);
    await join(student, group.joinCode).expect(201);

    expect(await members(doctor, group.id)).toMatchObject([
      {
        student: {
          id: student.id,
          email: student.email,
          languages: ['ja', 'fr'],
          activeLanguage: 'ja',
          suspension: null,
        },
        status: 'active',
      },
    ]);
  });

  it('removes a student, who cannot rejoin alone, and restores them', async () => {
    const doctor = await signInAsDoctor(context);
    const student = await signInAsStudent(context);
    const group = await createGroup(doctor);
    await join(student, group.joinCode).expect(201);

    const removed = await memberAction(doctor, group.id, student.id, 'remove').expect(200);
    expect(groupMemberResponseSchema.parse(removed.body).member.status).toBe('removed');
    await memberAction(doctor, group.id, student.id, 'remove').expect(200);

    const mine = studentGroupsResponseSchema.parse(
      (await student.agent.get('/api/student/groups')).body,
    );
    expect(mine.groups).toEqual([]);
    expect(errorOf(await join(student, group.joinCode).expect(403)).code).toBe(
      'REMOVED_FROM_GROUP',
    );

    const restored = await memberAction(doctor, group.id, student.id, 'restore').expect(200);
    expect(groupMemberResponseSchema.parse(restored.body).member.status).toBe('active');
  });

  it('rejects a request to join, which the student cannot repeat', async () => {
    const doctor = await signInAsDoctor(context);
    const student = await signInAsStudent(context);
    const group = await createGroup(doctor);
    await send(doctor.agent, 'patch', `/api/doctor/groups/${group.id}`, {
      requiresApproval: true,
    }).expect(200);
    await join(student, group.joinCode).expect(201);

    await memberAction(doctor, group.id, student.id, 'reject').expect(200);
    expect(errorOf(await join(student, group.joinCode).expect(403)).code).toBe(
      'REMOVED_FROM_GROUP',
    );
    const approveLate = await memberAction(doctor, group.id, student.id, 'approve').expect(409);
    expect(errorOf(approveLate).code).toBe('MEMBER_STATE_CHANGED');
  });

  it('adds a student by email, without a code', async () => {
    const doctor = await signInAsDoctor(context, ['fr']);
    const student = await signInAsStudent(context, ['en']);
    const group = await createGroup(doctor);

    later();
    const added = await post(doctor.agent, `/api/doctor/groups/${group.id}/members`, {
      email: student.email.toUpperCase(),
    }).expect(201);

    expect(groupMemberResponseSchema.parse(added.body).member.status).toBe('active');
    expect((await me(student.agent)).student?.languages).toEqual(['en', 'fr']);
    const again = await post(doctor.agent, `/api/doctor/groups/${group.id}/members`, {
      email: student.email,
    }).expect(409);
    expect(errorOf(again).code).toBe('ALREADY_MEMBER');
  });

  it('answers alike for an unknown email and for someone who is not a student', async () => {
    const doctor = await signInAsDoctor(context);
    const colleague = await signInAsDoctor(context);
    const group = await createGroup(doctor);

    for (const email of ['nobody@gmail.com', colleague.email]) {
      const response = await post(doctor.agent, `/api/doctor/groups/${group.id}/members`, {
        email,
      }).expect(404);
      expect(errorOf(response).code).toBe('STUDENT_NOT_FOUND');
    }
  });

  it('moves a student to another of the doctor’s groups', async () => {
    const doctor = await signInAsDoctor(context, ['fr', 'de']);
    const other = await signInAsDoctor(context, ['fr']);
    const student = await signInAsStudent(context, ['en']);
    const from = await createGroup(doctor);
    const to = await createGroup(doctor, { language: 'de', name: 'Deutsch 1' });
    const foreign = await createGroup(other);
    await join(student, from.joinCode).expect(201);

    await post(doctor.agent, `/api/doctor/groups/${from.id}/members/${student.id}/move`, {
      toGroupId: foreign.id,
    }).expect(404);
    await post(doctor.agent, `/api/doctor/groups/${from.id}/members/${student.id}/move`, {
      toGroupId: from.id,
    }).expect(400);
    later();
    const moved = await post(
      doctor.agent,
      `/api/doctor/groups/${from.id}/members/${student.id}/move`,
      { toGroupId: to.id },
    ).expect(200);

    expect(groupMemberResponseSchema.parse(moved.body).member.status).toBe('active');
    expect((await members(doctor, from.id))[0]?.status).toBe('removed');
    expect((await me(student.agent)).student?.languages).toEqual(['en', 'fr', 'de']);
  });
});

describe('suspending a student’s account', () => {
  async function studentInGroupOf(...doctors: Person[]) {
    const student = await signInAsStudent(context);
    for (const doctor of doctors) {
      const group = await createGroup(doctor);
      await join(student, group.joinCode).expect(201);
    }
    return student;
  }

  it('signs the student out everywhere and keeps them out', async () => {
    const doctor = await signInAsDoctor(context);
    const person = identity();
    const { agent } = await signIn(context, person);
    await post(agent, '/api/onboarding/student', {
      languages: ['en'],
      activeLanguage: 'en',
      goal: 'study',
    }).expect(200);
    const group = await createGroup(doctor);
    await post(agent, '/api/student/join', { code: group.joinCode }).expect(201);
    const studentId = await idOf(agent);

    await post(doctor.agent, `/api/doctor/students/${studentId}/suspend`, {
      reason: 'Shared exam answers',
    }).expect(204);

    await agent.get('/api/me').expect(401);
    expect((await signIn(context, person)).landing).toBe('/sign-in');
    expect((await members(doctor, group.id))[0]?.student.suspension).toMatchObject({
      byMe: true,
      reason: 'Shared exam answers',
    });
  });

  it('can be lifted only by the doctor who suspended', async () => {
    const suspender = await signInAsDoctor(context);
    const colleague = await signInAsDoctor(context);
    const student = await studentInGroupOf(suspender, colleague);

    await post(suspender.agent, `/api/doctor/students/${student.id}/suspend`, {
      reason: 'Cheating',
    }).expect(204);
    const again = await post(colleague.agent, `/api/doctor/students/${student.id}/suspend`, {
      reason: 'Also cheating',
    }).expect(409);
    expect(errorOf(again).code).toBe('ALREADY_SUSPENDED');
    const lift = await post(colleague.agent, `/api/doctor/students/${student.id}/unsuspend`).expect(
      403,
    );
    expect(errorOf(lift).code).toBe('NOT_SUSPENDER');

    await post(suspender.agent, `/api/doctor/students/${student.id}/unsuspend`).expect(204);
    await post(suspender.agent, `/api/doctor/students/${student.id}/unsuspend`).expect(204);
  });

  it('is only for students in the doctor’s groups, and needs a reason', async () => {
    const doctor = await signInAsDoctor(context);
    const stranger = await signInAsStudent(context);
    const student = await studentInGroupOf(doctor);

    const refused = await post(doctor.agent, `/api/doctor/students/${stranger.id}/suspend`, {
      reason: 'No reason',
    }).expect(404);
    expect(errorOf(refused).code).toBe('STUDENT_NOT_FOUND');
    await post(doctor.agent, `/api/doctor/students/${student.id}/suspend`, {
      reason: ' ',
    }).expect(400);
  });
});
