import {
  assistedGroupsResponseSchema,
  chatMessageResponseSchema,
  chatPageSchema,
  unreadNotificationsSchema,
  groupViewResponseSchema,
  notificationsResponseSchema,
  type Group,
} from '@acu/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
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
  send,
  signInAsDoctor,
  signInAsStudent,
  type Person,
} from '../../test/people';

let context: TestContext;

beforeAll(async () => {
  context = await createTestContext();
  await setDoctorCode(context);
});

afterAll(async () => {
  await context.close();
});

async function classroom(on: TestContext = context) {
  const doctor = await signInAsDoctor(on);
  const omar = await signInAsStudent(on);
  const nour = await signInAsStudent(on);
  const group = await createGroup(doctor);
  for (const student of [omar, nour]) {
    await post(student.agent, '/api/student/join', { code: group.joinCode }).expect(201);
  }
  return { doctor, omar, nour, group };
}

function write(person: Person, groupId: string, body: string) {
  return person.agent
    .post(`/api/groups/${groupId}/chat`)
    .set('Origin', WEB_ORIGIN)
    .field('body', body);
}

async function say(person: Person, groupId: string, body: string) {
  return chatMessageResponseSchema.parse((await write(person, groupId, body).expect(201)).body)
    .message;
}

async function view(person: Person, groupId: string) {
  return groupViewResponseSchema.parse(
    (await person.agent.get(`/api/groups/${groupId}`).expect(200)).body,
  ).group;
}

async function notificationsOf(person: Person) {
  return notificationsResponseSchema.parse(
    (await person.agent.get('/api/notifications').expect(200)).body,
  );
}

async function unreadOf(person: Person) {
  return unreadNotificationsSchema.parse(
    (await person.agent.get('/api/notifications/unread').expect(200)).body,
  ).unread;
}

function setRole(doctor: Person, group: Group, student: Person, role: string) {
  return post(doctor.agent, `/api/doctor/groups/${group.id}/members/${student.id}/role`, { role });
}

describe('roles in a group', () => {
  it('lets a moderator pin and delete students’ messages, but not the doctor’s', async () => {
    const { doctor, omar, nour, group } = await classroom();
    await setRole(doctor, group, omar, 'moderator').expect(200);
    const fromNour = await say(nour, group.id, 'off topic');
    const fromDoctor = await say(doctor, group.id, 'welcome');

    await post(omar.agent, `/api/groups/${group.id}/chat/${fromNour.id}/pin`).expect(200);
    await omar.agent
      .delete(`/api/groups/${group.id}/chat/${fromNour.id}`)
      .set('Origin', WEB_ORIGIN)
      .expect(200);
    await omar.agent
      .delete(`/api/groups/${group.id}/chat/${fromDoctor.id}`)
      .set('Origin', WEB_ORIGIN)
      .expect(403);

    const seen = await view(omar, group.id);
    expect(seen.role).toBe('moderator');
    expect(seen.can).toMatchObject({ pin: true, moderate: true, announce: false, teach: false });
  });

  it('lets moderators and the representative write while the chat is closed', async () => {
    const { doctor, omar, nour, group } = await classroom();
    await setRole(doctor, group, omar, 'representative').expect(200);
    await send(doctor.agent, 'patch', `/api/doctor/groups/${group.id}`, { chatOpen: false }).expect(
      200,
    );

    await write(omar, group.id, 'Lecture moved to room 210').expect(201);
    expect(errorOf(await write(nour, group.id, 'ok').expect(403)).code).toBe('CHAT_CLOSED');
  });

  it('keeps plain students from pinning', async () => {
    const { doctor, omar, group } = await classroom();
    const message = await say(doctor, group.id, 'hello');

    await post(omar.agent, `/api/groups/${group.id}/chat/${message.id}/pin`).expect(403);
  });

  it('tells a student about the role they were given', async () => {
    const { doctor, omar, group } = await classroom();
    await setRole(doctor, group, omar, 'moderator').expect(200);

    const { notifications } = await notificationsOf(omar);
    expect(notifications[0]).toMatchObject({
      kind: 'role',
      excerpt: 'moderator',
      group: { id: group.id },
    });
  });

  it('gives roles to active students only', async () => {
    const { doctor, omar, group } = await classroom();
    await post(omar.agent, `/api/student/groups/${group.id}/leave`, {}).expect(204);

    await setRole(doctor, group, omar, 'moderator').expect(404);
  });
});

describe('teaching assistants', () => {
  it('adds a doctor account by email, who then helps run the group', async () => {
    const { doctor, omar, group } = await classroom();
    const assistant = await signInAsDoctor(context);
    await post(doctor.agent, `/api/doctor/groups/${group.id}/assistants`, {
      email: assistant.email,
    }).expect(201);
    const message = await say(omar, group.id, 'question');

    const seen = await view(assistant, group.id);
    expect(seen.role).toBe('assistant');
    expect(seen.can).toMatchObject({ teach: true, mute: true, manage: false });
    await post(assistant.agent, `/api/groups/${group.id}/chat/${message.id}/pin`).expect(200);
    await post(assistant.agent, `/api/groups/${group.id}/members/${omar.id}/mute`, {
      muted: true,
    }).expect(200);
    // Settings stay the doctor's.
    await send(assistant.agent, 'patch', `/api/doctor/groups/${group.id}`, { name: 'Mine' }).expect(
      404,
    );

    const assisting = assistedGroupsResponseSchema.parse(
      (await assistant.agent.get('/api/doctor/assisting').expect(200)).body,
    ).groups;
    expect(assisting).toMatchObject([{ id: group.id, students: 2, role: 'assistant' }]);
  });

  it('refuses students, strangers and the doctor themselves', async () => {
    const { doctor, omar, group } = await classroom();
    const path = `/api/doctor/groups/${group.id}/assistants`;

    expect(errorOf(await post(doctor.agent, path, { email: omar.email }).expect(404)).code).toBe(
      'ASSISTANT_NOT_FOUND',
    );
    await post(doctor.agent, path, { email: 'nobody@acu.edu.eg' }).expect(404);
    expect(errorOf(await post(doctor.agent, path, { email: doctor.email }).expect(409)).code).toBe(
      'ALREADY_ASSISTANT',
    );
  });

  it('loses access once removed', async () => {
    const { doctor, group } = await classroom();
    const assistant = await signInAsDoctor(context);
    await post(doctor.agent, `/api/doctor/groups/${group.id}/assistants`, {
      email: assistant.email,
    }).expect(201);
    await doctor.agent
      .delete(`/api/doctor/groups/${group.id}/assistants/${assistant.id}`)
      .set('Origin', WEB_ORIGIN)
      .expect(204);

    await assistant.agent.get(`/api/groups/${group.id}`).expect(404);
  });
});

describe('the chat’s schedule', () => {
  // Each test gets its own clock, starting on Sunday 4 October 2026 at 11:00 in Cairo (UTC+3).
  let clock: TestContext;

  beforeEach(async () => {
    clock = await createTestContext({ shareDatabaseWith: context });
  });

  afterEach(async () => {
    await clock.close();
  });

  it('opens the chat to students inside the weekly windows only', async () => {
    const { doctor, omar, group } = await classroom(clock);
    await send(doctor.agent, 'patch', `/api/doctor/groups/${group.id}`, {
      chatSchedule: { slots: [{ day: 0, start: '10:00', end: '12:00' }] },
    }).expect(200);

    let seen = await view(omar, group.id);
    expect(seen.chat).toMatchObject({ mode: 'scheduled', open: true, canPost: true });
    expect(seen.chat.nextChange).toEqual({ at: '2026-10-04T09:00:00.000Z', opens: false });
    await write(omar, group.id, 'during class').expect(201);

    clock.advance(90 * 60 * 1000);
    seen = await view(omar, group.id);
    expect(seen.chat).toMatchObject({ open: false, canPost: false });
    expect(seen.chat.nextChange).toEqual({ at: '2026-10-11T07:00:00.000Z', opens: true });
    expect(errorOf(await write(omar, group.id, 'after class').expect(403)).code).toBe(
      'CHAT_CLOSED',
    );
    // The doctor writes whenever they like.
    await write(doctor, group.id, 'homework for next week').expect(201);
  });

  it('lets the doctor open or close by hand until the schedule next changes', async () => {
    const { doctor, omar, group } = await classroom(clock);
    const path = `/api/doctor/groups/${group.id}`;
    // Sunday 11:00 in Cairo: the only window is on Monday, so the schedule says closed.
    await send(doctor.agent, 'patch', path, {
      chatSchedule: { slots: [{ day: 1, start: '10:00', end: '12:00' }] },
    }).expect(200);
    expect((await view(omar, group.id)).chat).toMatchObject({ open: false, manual: false });

    await send(doctor.agent, 'patch', path, { chatOpen: true }).expect(200);
    let seen = await view(omar, group.id);
    expect(seen.chat).toMatchObject({ mode: 'scheduled', open: true, manual: true });
    // Open by hand until Monday 10:00, then the schedule keeps it open until 12:00.
    expect(seen.chat.nextChange).toEqual({ at: '2026-10-05T09:00:00.000Z', opens: false });
    await write(omar, group.id, 'thanks for opening').expect(201);

    // Closing again agrees with the schedule, so nothing is left overridden.
    await send(doctor.agent, 'patch', path, { chatOpen: false }).expect(200);
    seen = await view(omar, group.id);
    expect(seen.chat).toMatchObject({ open: false, manual: false });
    expect(seen.chat.nextChange).toEqual({ at: '2026-10-05T07:00:00.000Z', opens: true });
  });

  it('closes by hand during a window, and reopens with the next one', async () => {
    const { doctor, omar, group } = await classroom(clock);
    const path = `/api/doctor/groups/${group.id}`;
    await send(doctor.agent, 'patch', path, {
      chatSchedule: {
        slots: [
          { day: 0, start: '10:00', end: '12:00' },
          { day: 0, start: '14:00', end: '15:00' },
        ],
      },
    }).expect(200);
    await send(doctor.agent, 'patch', path, { chatOpen: false }).expect(200);

    const seen = await view(omar, group.id);
    expect(seen.chat).toMatchObject({ open: false, manual: true });
    expect(seen.chat.nextChange).toEqual({ at: '2026-10-04T11:00:00.000Z', opens: true });
    clock.advance(3.5 * 60 * 60 * 1000);
    expect((await view(omar, group.id)).chat).toMatchObject({ open: true, manual: false });
  });

  it('goes back to the plain switch when the schedule is removed', async () => {
    const { doctor, omar, group } = await classroom(clock);
    const path = `/api/doctor/groups/${group.id}`;
    await send(doctor.agent, 'patch', path, {
      chatSchedule: { slots: [{ day: 3, start: '09:00', end: '10:00' }] },
    }).expect(200);
    await send(doctor.agent, 'patch', path, { chatSchedule: null }).expect(200);

    expect((await view(omar, group.id)).chat).toMatchObject({ mode: 'open', open: true });
  });

  it('refuses windows that end before they start', async () => {
    const { doctor, group } = await classroom(clock);

    await send(doctor.agent, 'patch', `/api/doctor/groups/${group.id}`, {
      chatSchedule: { slots: [{ day: 1, start: '12:00', end: '10:00' }] },
    }).expect(400);
  });
});

describe('mentions', () => {
  it('names people in the group and tells them, dropping anyone else', async () => {
    const { doctor, omar, nour, group } = await classroom();
    const stranger = await signInAsStudent(context);

    const message = await say(omar, group.id, `@[${nour.id}] @[${stranger.id}] see page 4`);

    expect(message.body).toBe(`@[${nour.id}] see page 4`);
    expect(message.mentions.map((mention) => mention.id)).toEqual([nour.id]);
    const { notifications, unread } = await notificationsOf(nour);
    expect(unread).toBe(1);
    expect(notifications[0]).toMatchObject({
      kind: 'mention',
      link: `/app/groups/${group.id}?tab=chat&message=${message.id}`,
    });
    // The mention travels inside a directional isolate.
    expect(notifications[0]?.excerpt).toMatch(/^⁨@.+⁩ see page 4$/);
    expect((await notificationsOf(doctor)).notifications).toEqual([]);
  });

  it('lets only the staff and roles call everyone', async () => {
    const { doctor, omar, nour, group } = await classroom();

    const fromStudent = await say(omar, group.id, '@[all] hi');
    expect(fromStudent).toMatchObject({ body: 'hi', mentionsAll: false });

    const fromDoctor = await say(doctor, group.id, '@[all] quiz on Monday');
    expect(fromDoctor.mentionsAll).toBe(true);
    const seenByNour = (await notificationsOf(nour)).notifications;
    expect(seenByNour.map((entry) => entry.kind)).toEqual(['mention']);
  });

  it('marks a message that mentions the reader', async () => {
    const { doctor, omar, group } = await classroom();
    await say(doctor, group.id, `@[${omar.id}] your turn`);

    const page = await omar.agent.get(`/api/groups/${group.id}/chat`).expect(200);
    expect(chatPageSchema.parse(page.body).messages.at(-1)?.mentionsMe).toBe(true);
  });
});

describe('notifications', () => {
  it('pushes to subscribed browsers in their language, as each person chose', async () => {
    const { doctor, omar, nour, group } = await classroom();
    const endpoint = 'https://push.example.com/omar';
    await post(omar.agent, '/api/notifications/subscriptions', {
      subscription: { endpoint, keys: { p256dh: 'p256dh-key-0123456789', auth: 'auth-key-0123' } },
      locale: 'en',
    }).expect(204);
    await post(nour.agent, '/api/notifications/subscriptions', {
      subscription: {
        endpoint: 'https://push.example.com/nour',
        keys: { p256dh: 'p256dh-key-0123456789', auth: 'auth-key-0123' },
      },
      locale: 'ar',
    }).expect(204);
    await send(nour.agent, 'put', '/api/notifications/settings', {
      mentions: false,
      announcements: true,
      polls: true,
      grades: true,
      messages: false,
    }).expect(200);

    await say(doctor, group.id, `@[${omar.id}] @[${nour.id}] please stay after class`);

    const pushed = context.push.sent.filter((entry) => entry.message.url.includes(group.id));
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.endpoint).toBe(endpoint);
    expect(pushed[0]?.message.title).toMatch(/mentioned you in Conversation 2$/);
  });

  it('forgets a browser that dropped its subscription', async () => {
    const { doctor, omar, group } = await classroom();
    const endpoint = 'https://push.example.com/gone';
    await post(omar.agent, '/api/notifications/subscriptions', {
      subscription: { endpoint, keys: { p256dh: 'p256dh-key-0123456789', auth: 'auth-key-0123' } },
      locale: 'ar',
    }).expect(204);
    context.push.gone.add(endpoint);

    await say(doctor, group.id, `@[${omar.id}] hello`);

    await expect
      .poll(async () => {
        const response = await omar.agent.get('/api/notifications/settings');
        return (response.body as { push: { devices: number } }).push.devices;
      })
      .toBe(0);
  });

  it('marks notifications read one by one or all at once', async () => {
    const { doctor, omar, group } = await classroom();
    await say(doctor, group.id, `@[${omar.id}] one`);
    await say(doctor, group.id, `@[${omar.id}] two`);
    const { notifications } = await notificationsOf(omar);

    await post(omar.agent, '/api/notifications/read', { ids: [notifications[0]?.id] }).expect(204);
    expect(await unreadOf(omar)).toBe(1);
    await post(omar.agent, '/api/notifications/read', { all: true }).expect(204);
    expect(await unreadOf(omar)).toBe(0);
  });

  it('keeps each person’s notifications to themselves', async () => {
    const { doctor, omar, group } = await classroom();
    await say(doctor, group.id, `@[${omar.id}] private`);
    const { agent: other } = await signIn(context, identity());

    const list = notificationsResponseSchema.parse(
      (await other.get('/api/notifications').expect(200)).body,
    );
    expect(list.notifications).toEqual([]);
  });
});
