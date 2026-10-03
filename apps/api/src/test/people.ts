import {
  groupResponseSchema,
  meResponseSchema,
  type Group,
  type LearningLanguage,
} from '@acu/shared';
import {
  DOCTOR_CODE,
  WEB_ORIGIN,
  identity,
  post,
  signIn,
  type Agent,
  type TestContext,
} from './harness';

/** Someone signed in, as the tests drive them. */
export interface Person {
  agent: Agent;
  id: string;
  email: string;
}

let staffCounter = 0;
let studentCounter = 0;

/** A university number no other test student has. */
export function nextUniversityId(): string {
  studentCounter += 1;
  return `2026${String(studentCounter).padStart(4, '0')}`;
}

export async function idOf(agent: Agent): Promise<string> {
  return meResponseSchema.parse((await agent.get('/api/me').expect(200)).body).user.id;
}

export async function me(agent: Agent) {
  return meResponseSchema.parse((await agent.get('/api/me').expect(200)).body).user;
}

export function errorOf(response: { body: unknown }) {
  return (response.body as { error: { code: string; details?: Record<string, unknown> } }).error;
}

/** PUT or PATCH from the web app's origin. */
export function send(agent: Agent, method: 'put' | 'patch', path: string, body: object) {
  return agent[method](path).set('Origin', WEB_ORIGIN).send(body);
}

/**
 * A doctor who signed in with their university Google account, so they are active at once. The
 * faculty code must be set on the context first.
 */
export async function signInAsDoctor(
  context: TestContext,
  languages: LearningLanguage[] = ['fr'],
): Promise<Person> {
  staffCounter += 1;
  const email = `doctor${String(staffCounter)}@acu.edu.eg`;
  const { agent } = await signIn(context, identity({ email }));
  await post(agent, '/api/onboarding/doctor', {
    accessCode: DOCTOR_CODE,
    staffId: `ACU-G${String(staffCounter)}`,
    displayName: `Dr. Group ${String(staffCounter)}`,
    languages,
    universityEmail: email,
  }).expect(200);
  return { agent, id: await idOf(agent), email };
}

export async function signInAsStudent(
  context: TestContext,
  languages: LearningLanguage[] = ['en'],
): Promise<Person> {
  const person = identity();
  const { agent } = await signIn(context, person);
  await post(agent, '/api/onboarding/student', {
    languages,
    activeLanguage: languages[0],
    goal: 'study',
    universityId: nextUniversityId(),
  }).expect(200);
  return { agent, id: await idOf(agent), email: person.email };
}

export async function createGroup(
  doctor: Person,
  overrides: Record<string, unknown> = {},
): Promise<Group> {
  const response = await post(doctor.agent, '/api/doctor/groups', {
    name: 'Conversation 2',
    language: 'fr',
    ...overrides,
  }).expect(201);
  return groupResponseSchema.parse(response.body).group;
}
