import { groupPeopleResponseSchema, personResponseSchema, type Group } from '@acu/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  identity,
  post,
  setDoctorCode,
  signIn,
  type TestContext,
} from '../../test/harness';
import { createGroup, signInAsDoctor, signInAsStudent, type Person } from '../../test/people';

let context: TestContext;

beforeAll(async () => {
  context = await createTestContext();
  await setDoctorCode(context);
});

afterAll(async () => {
  await context.close();
});

async function join(student: Person, group: Group) {
  await post(student.agent, '/api/student/join', { code: group.joinCode }).expect(201);
}

/** A doctor's group with two students in it, and a student who is not. */
async function classroom() {
  const doctor = await signInAsDoctor(context, ['fr', 'de']);
  const omar = await signInAsStudent(context, ['en']);
  const nour = await signInAsStudent(context, ['ja']);
  const outsider = await signInAsStudent(context);
  const group = await createGroup(doctor);
  await join(omar, group);
  await join(nour, group);
  return { doctor, omar, nour, outsider, group };
}

async function peopleOf(person: Person, groupId: string) {
  return groupPeopleResponseSchema.parse(
    (await person.agent.get(`/api/groups/${groupId}/people`).expect(200)).body,
  ).people;
}

async function profile(viewer: Person, personId: string) {
  return personResponseSchema.parse(
    (await viewer.agent.get(`/api/people/${personId}`).expect(200)).body,
  ).person;
}

describe('the people of a group', () => {
  it('shows a student the doctor first, then their classmates', async () => {
    const { doctor, omar, nour, group } = await classroom();

    const people = await peopleOf(omar, group.id);
    const [first, ...students] = people;

    expect(first).toMatchObject({ id: doctor.id, role: 'owner', joinedAt: null });
    expect(first?.name).toMatch(/^Dr\./);
    expect(students.map((person) => person.id).sort()).toEqual([omar.id, nour.id].sort());
    expect(students.map((person) => person.name)).toEqual(
      students.map((person) => person.name).sort((a, b) => a.localeCompare(b)),
    );
    expect(people.find((person) => person.id === omar.id)?.me).toBe(true);
  });

  it('leaves out students who are waiting or were removed', async () => {
    const doctor = await signInAsDoctor(context);
    const group = await createGroup(doctor, { requiresApproval: true });
    const waiting = await signInAsStudent(context);
    await join(waiting, group);
    const active = await signInAsStudent(context);
    await post(doctor.agent, `/api/doctor/groups/${group.id}/members`, {
      identifier: active.email,
    }).expect(201);

    const people = await peopleOf(doctor, group.id);

    expect(people.map((person) => person.id)).toEqual([doctor.id, active.id]);
  });

  it('is not shown to anyone outside the group', async () => {
    const { outsider, group } = await classroom();

    await outsider.agent.get(`/api/groups/${group.id}/people`).expect(404);
  });
});

describe('a person’s profile', () => {
  it('shows a classmate without their email', async () => {
    const { omar, nour, group } = await classroom();

    const person = await profile(omar, nour.id);

    expect(person).toMatchObject({
      id: nour.id,
      role: 'student',
      email: null,
      languages: ['fr', 'ja'],
      activeLanguage: 'ja',
      me: false,
    });
    expect(person.sharedGroups.map((shared) => shared.id)).toEqual([group.id]);
  });

  it('shows a student their doctor with the university email and languages taught', async () => {
    const { doctor, omar } = await classroom();

    const person = await profile(omar, doctor.id);

    expect(person).toMatchObject({
      role: 'doctor',
      email: doctor.email,
      languages: ['fr', 'de'],
      activeLanguage: null,
    });
  });

  it('shows a doctor their student’s email, even after the student left', async () => {
    const { doctor, omar, group } = await classroom();
    await post(omar.agent, `/api/student/groups/${group.id}/leave`, {}).expect(204);

    const person = await profile(doctor, omar.id);

    expect(person.email).toBe(omar.email);
    expect(person.sharedGroups).toEqual([]);
  });

  it('shows someone their own profile', async () => {
    const { omar } = await classroom();

    expect(await profile(omar, omar.id)).toMatchObject({ me: true, email: omar.email });
  });

  it('answers as if the person did not exist to someone who shares no group with them', async () => {
    const { doctor, nour, outsider } = await classroom();
    const otherDoctor = await signInAsDoctor(context);
    const { agent: newcomer } = await signIn(context, identity());

    await outsider.agent.get(`/api/people/${nour.id}`).expect(404);
    await outsider.agent.get(`/api/people/${doctor.id}`).expect(404);
    await otherDoctor.agent.get(`/api/people/${nour.id}`).expect(404);
    await newcomer.get(`/api/people/${nour.id}`).expect(404);
    await outsider.agent.get('/api/people/not-an-id').expect(404);
  });

  it('is only for signed-in people', async () => {
    const { nour } = await classroom();

    await context.client().get(`/api/people/${nour.id}`).expect(401);
  });
});
