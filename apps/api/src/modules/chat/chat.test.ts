import {
  chatChangesSchema,
  chatMessageResponseSchema,
  chatPageSchema,
  groupMembersResponseSchema,
  groupResponseSchema,
  groupsResponseSchema,
  groupViewResponseSchema,
  studentGroupsResponseSchema,
  type Group,
} from '@acu/shared';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents } from '../../db/schema';
import {
  WEB_ORIGIN,
  createTestContext,
  post,
  setDoctorCode,
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

interface Classroom {
  doctor: Person;
  student: Person;
  group: Group;
}

/** A doctor, a group of theirs, and a student in it. */
async function classroom(overrides: Record<string, unknown> = {}): Promise<Classroom> {
  const doctor = await signInAsDoctor(context);
  const student = await signInAsStudent(context);
  const group = await createGroup(doctor, overrides);
  await post(student.agent, '/api/student/join', { code: group.joinCode }).expect(201);
  return { doctor, student, group };
}

function write(person: Person, groupId: string, body: string, replyToId?: string) {
  const request = person.agent.post(`/api/groups/${groupId}/chat`).set('Origin', WEB_ORIGIN);
  return replyToId
    ? request.field('body', body).field('replyToId', replyToId)
    : request.field('body', body);
}

async function say(person: Person, groupId: string, body: string) {
  const response = await write(person, groupId, body).expect(201);
  return chatMessageResponseSchema.parse(response.body).message;
}

async function page(person: Person, groupId: string) {
  return chatPageSchema.parse(
    (await person.agent.get(`/api/groups/${groupId}/chat`).expect(200)).body,
  );
}

async function view(person: Person, groupId: string) {
  return groupViewResponseSchema.parse(
    (await person.agent.get(`/api/groups/${groupId}`).expect(200)).body,
  ).group;
}

describe('who may use a group’s chat', () => {
  it('lets the doctor and the group’s students in, with what each may do', async () => {
    const { doctor, student, group } = await classroom();

    expect(await view(doctor, group.id)).toMatchObject({
      isDoctor: true,
      chat: { open: true, canPost: true, muted: false },
    });
    expect(await view(student, group.id)).toMatchObject({
      isDoctor: false,
      name: 'Conversation 2',
      doctor: { name: expect.stringMatching(/^Dr\. Group/) as string },
      chat: { canPost: true },
    });
  });

  it('keeps everyone else out as if the group did not exist', async () => {
    const { group } = await classroom({ requiresApproval: false });
    const stranger = await signInAsStudent(context);
    const otherDoctor = await signInAsDoctor(context);
    const doctor = await signInAsDoctor(context);
    const waiting = await signInAsStudent(context);
    const approvalGroup = await createGroup(doctor, { requiresApproval: true });
    await post(waiting.agent, '/api/student/join', { code: approvalGroup.joinCode }).expect(201);

    for (const [person, groupId] of [
      [stranger, group.id],
      [otherDoctor, group.id],
      [waiting, approvalGroup.id],
    ] as const) {
      const response = await person.agent.get(`/api/groups/${groupId}/chat`).expect(404);
      expect(errorOf(response).code).toBe('NOT_FOUND');
      await write(person, groupId, 'hello').expect(404);
    }
    await context.client().get(`/api/groups/${group.id}/chat`).expect(401);
  });
});

describe('writing', () => {
  it('posts, replies with a quote, and marks the doctor’s messages', async () => {
    const { doctor, student, group } = await classroom();
    const question = await say(student, group.id, 'What does « bonjour » mean?');

    const answer = chatMessageResponseSchema.parse(
      (await write(doctor, group.id, 'Hello, or good morning.', question.id).expect(201)).body,
    ).message;

    expect(answer).toMatchObject({
      body: 'Hello, or good morning.',
      author: { isDoctor: true },
      replyTo: { id: question.id, excerpt: 'What does « bonjour » mean?' },
      mine: true,
    });
    const { messages } = await page(student, group.id);
    expect(messages.map((message) => message.body)).toEqual([
      'What does « bonjour » mean?',
      'Hello, or good morning.',
    ]);
    expect(messages[1]?.mine).toBe(false);
  });

  it('refuses an empty message, and one that is too long', async () => {
    const { student, group } = await classroom();

    expect(errorOf(await write(student, group.id, '   ').expect(400)).code).toBe(
      'VALIDATION_FAILED',
    );
    await write(student, group.id, 'x'.repeat(4001)).expect(400);
  });

  it('sends attachments: images re-encoded, documents to download', async () => {
    const { doctor, student, group } = await classroom();
    const image = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: '#138a85' },
    })
      .jpeg()
      .toBuffer();

    const withImage = chatMessageResponseSchema.parse(
      (
        await doctor.agent
          .post(`/api/groups/${group.id}/chat`)
          .set('Origin', WEB_ORIGIN)
          .attach('file', image, 'board.jpg')
          .expect(201)
      ).body,
    ).message;
    expect(withImage.attachment).toMatchObject({
      kind: 'image',
      contentType: 'image/webp',
      width: 1600,
      height: 800,
    });

    const withPdf = chatMessageResponseSchema.parse(
      (
        await doctor.agent
          .post(`/api/groups/${group.id}/chat`)
          .set('Origin', WEB_ORIGIN)
          .field('body', 'This week’s reading')
          .attach('file', Buffer.from('%PDF-1.7\n%…'), 'Lesson 4.pdf')
          .expect(201)
      ).body,
    ).message;
    expect(withPdf.attachment).toMatchObject({ kind: 'document', name: 'Lesson 4.pdf' });

    const download = await student.agent.get(withPdf.attachment?.url ?? '').expect(200);
    expect(download.headers['content-disposition']).toMatch(
      /^attachment; filename\*=UTF-8''Lesson%204\.pdf/,
    );
  });

  it('refuses files it does not know', async () => {
    const { student, group } = await classroom();
    const response = await student.agent
      .post(`/api/groups/${group.id}/chat`)
      .set('Origin', WEB_ORIGIN)
      .attach('file', Buffer.from('MZ\u0090\0'), 'homework.exe')
      .expect(415);

    expect(errorOf(response).code).toBe('UNSUPPORTED_FILE');
  });

  it('lets students send 60 messages a minute unless the doctor chooses otherwise', async () => {
    const { student, group } = await classroom();

    expect((await view(student, group.id)).chat.rateLimit).toBe(60);
  });

  it('slows down a student at the limit their doctor set', async () => {
    const { doctor, student, group } = await classroom();
    await send(doctor.agent, 'patch', `/api/doctor/groups/${group.id}`, {
      chatRateLimit: 3,
    }).expect(200);
    for (let index = 0; index < 3; index += 1) {
      await write(student, group.id, `message ${String(index)}`).expect(201);
    }

    const blocked = errorOf(await write(student, group.id, 'one more').expect(429));
    expect(blocked.code).toBe('CHAT_RATE_LIMITED');
    expect(blocked.details).toEqual({ limit: 3 });
    // The doctor is not held to the students' limit.
    await write(doctor, group.id, 'announcement').expect(201);
    context.advance(61 * 1000);
    await write(student, group.id, 'a minute later').expect(201);
  });

  it('keeps the limit within what one person can reasonably send', async () => {
    const { doctor, group } = await classroom();
    for (const chatRateLimit of [0, 121, 2.5]) {
      await send(doctor.agent, 'patch', `/api/doctor/groups/${group.id}`, {
        chatRateLimit,
      }).expect(400);
    }
  });
});

describe('the doctor’s controls', () => {
  it('closes the chat to students, who keep reading', async () => {
    const { doctor, student, group } = await classroom();
    await send(doctor.agent, 'patch', `/api/doctor/groups/${group.id}`, { chatOpen: false }).expect(
      200,
    );

    expect(errorOf(await write(student, group.id, 'hello').expect(403)).code).toBe('CHAT_CLOSED');
    await say(doctor, group.id, 'Announcement: the quiz moves to Monday.');
    expect((await view(student, group.id)).chat).toMatchObject({ open: false, canPost: false });
    expect((await page(student, group.id)).messages).toHaveLength(1);
  });

  it('mutes one student, and gives them their voice back', async () => {
    const { doctor, student, group } = await classroom();
    const mute = (muted: boolean) =>
      post(doctor.agent, `/api/doctor/groups/${group.id}/members/${student.id}/chat-mute`, {
        muted,
      });

    await mute(true).expect(200);
    expect(errorOf(await write(student, group.id, 'hello').expect(403)).code).toBe('CHAT_MUTED');
    const members = groupMembersResponseSchema.parse(
      (await doctor.agent.get(`/api/doctor/groups/${group.id}/members`)).body,
    ).members;
    expect(members[0]?.chatMuted).toBe(true);

    await mute(false).expect(200);
    await write(student, group.id, 'hello again').expect(201);
  });

  it('pins messages; students cannot', async () => {
    const { doctor, student, group } = await classroom();
    const rule = await say(doctor, group.id, 'Class rules: be kind, write in French.');

    await post(student.agent, `/api/groups/${group.id}/chat/${rule.id}/pin`).expect(403);
    await post(doctor.agent, `/api/groups/${group.id}/chat/${rule.id}/pin`).expect(200);
    for (let index = 0; index < 3; index += 1) {
      await say(student, group.id, `later message ${String(index)}`);
    }

    const { pinned } = await page(student, group.id);
    expect(pinned.map((message) => message.id)).toEqual([rule.id]);
    await post(doctor.agent, `/api/groups/${group.id}/chat/${rule.id}/unpin`).expect(200);
    expect((await page(student, group.id)).pinned).toEqual([]);
  });

  it('deletes any message, which is audited, and the attachment goes with it', async () => {
    const { doctor, student, group } = await classroom();
    const response = await student.agent
      .post(`/api/groups/${group.id}/chat`)
      .set('Origin', WEB_ORIGIN)
      .field('body', 'my answers')
      .attach('file', Buffer.from('%PDF-1.7\n'), 'answers.pdf')
      .expect(201);
    const message = chatMessageResponseSchema.parse(response.body).message;
    const stored = context.storage.files.size;

    const deleted = chatMessageResponseSchema.parse(
      (
        await doctor.agent
          .delete(`/api/groups/${group.id}/chat/${message.id}`)
          .set('Origin', WEB_ORIGIN)
          .expect(200)
      ).body,
    ).message;

    expect(deleted).toMatchObject({ deleted: true, body: null, attachment: null });
    expect(context.storage.files.size).toBe(stored - 1);
    await student.agent.get(message.attachment?.url ?? '').expect(404);
    const audit = await context.database.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorUserId, doctor.id));
    expect(audit.map((event) => event.action)).toContain('group.chat_message_deleted');
  });
});

describe('editing and deleting one’s own messages', () => {
  it('edits one’s own text, but not someone else’s', async () => {
    const { doctor, student, group } = await classroom();
    const mine = await say(student, group.id, 'Je suis etudiant');
    const theirs = await say(doctor, group.id, 'Welcome');

    const edited = chatMessageResponseSchema.parse(
      (
        await send(student.agent, 'patch', `/api/groups/${group.id}/chat/${mine.id}`, {
          body: 'Je suis étudiant',
        }).expect(200)
      ).body,
    ).message;
    expect(edited).toMatchObject({ body: 'Je suis étudiant', edited: true });

    const refused = await send(
      student.agent,
      'patch',
      `/api/groups/${group.id}/chat/${theirs.id}`,
      {
        body: 'changed',
      },
    ).expect(403);
    expect(errorOf(refused).code).toBe('MESSAGE_NOT_EDITABLE');
    await student.agent
      .delete(`/api/groups/${group.id}/chat/${theirs.id}`)
      .set('Origin', WEB_ORIGIN)
      .expect(403);
    await student.agent
      .delete(`/api/groups/${group.id}/chat/${mine.id}`)
      .set('Origin', WEB_ORIGIN)
      .expect(200);
  });
});

describe('keeping up', () => {
  it('returns only what changed since the last version seen', async () => {
    const { doctor, student, group } = await classroom();
    const first = await say(doctor, group.id, 'first');
    const { version } = await page(student, group.id);

    const second = await say(student, group.id, 'second');
    await send(doctor.agent, 'patch', `/api/groups/${group.id}/chat/${first.id}`, {
      body: 'first, edited',
    }).expect(200);

    const changes = chatChangesSchema.parse(
      (
        await student.agent
          .get(`/api/groups/${group.id}/chat/changes?since=${String(version)}`)
          .expect(200)
      ).body,
    );
    expect(changes.messages.map((message) => message.id)).toEqual([second.id, first.id]);
    expect(changes.version).toBeGreaterThan(version);

    const nothing = chatChangesSchema.parse(
      (
        await student.agent.get(
          `/api/groups/${group.id}/chat/changes?since=${String(changes.version)}`,
        )
      ).body,
    );
    expect(nothing.messages).toEqual([]);
    await student.agent.get(`/api/groups/${group.id}/chat/changes?since=abc`).expect(400);
  });

  it('counts unread messages for both sides until they are read', async () => {
    const { doctor, student, group } = await classroom();
    await say(doctor, group.id, 'one');
    const last = await say(doctor, group.id, 'two');
    await say(student, group.id, 'hi');

    const studentGroups = studentGroupsResponseSchema.parse(
      (await student.agent.get('/api/student/groups')).body,
    ).groups;
    // Writing "hi" marked everything before it as read.
    expect(studentGroups[0]?.unread).toBe(0);
    const doctorGroups = groupsResponseSchema.parse(
      (await doctor.agent.get('/api/doctor/groups')).body,
    ).groups;
    expect(doctorGroups[0]?.unread).toBe(1);

    await say(doctor, group.id, 'three');
    expect(
      studentGroupsResponseSchema.parse((await student.agent.get('/api/student/groups')).body)
        .groups[0]?.unread,
    ).toBe(1);
    const newest = (await page(student, group.id)).messages.at(-1);
    await post(student.agent, `/api/groups/${group.id}/chat/read`, {
      seq: newest?.seq ?? last.seq,
    }).expect(204);
    expect(
      studentGroupsResponseSchema.parse((await student.agent.get('/api/student/groups')).body)
        .groups[0]?.unread,
    ).toBe(0);
  });
});

describe('when the group changes', () => {
  it('turns read-only when archived', async () => {
    const { doctor, student, group } = await classroom();
    await say(student, group.id, 'before');
    await post(doctor.agent, `/api/doctor/groups/${group.id}/archive`).expect(200);

    expect(errorOf(await write(doctor, group.id, 'after').expect(409)).code).toBe('GROUP_ARCHIVED');
    expect((await view(student, group.id)).chat.canPost).toBe(false);
    expect((await page(student, group.id)).messages).toHaveLength(1);
  });

  it('closes the chat and its files to a removed student', async () => {
    const { doctor, student, group } = await classroom();
    const withFile = chatMessageResponseSchema.parse(
      (
        await doctor.agent
          .post(`/api/groups/${group.id}/chat`)
          .set('Origin', WEB_ORIGIN)
          .attach('file', Buffer.from('%PDF-1.7\n'), 'notes.pdf')
          .expect(201)
      ).body,
    ).message;
    await student.agent.get(withFile.attachment?.url ?? '').expect(200);

    await post(doctor.agent, `/api/doctor/groups/${group.id}/members/${student.id}/remove`).expect(
      200,
    );

    await student.agent.get(`/api/groups/${group.id}/chat`).expect(404);
    await student.agent.get(withFile.attachment?.url ?? '').expect(404);
  });

  it('shows a group photo chosen by the doctor', async () => {
    const { doctor, student, group } = await classroom();
    const photo = await sharp({
      create: { width: 900, height: 600, channels: 3, background: '#cfad42' },
    })
      .png()
      .toBuffer();

    const updated = groupResponseSchema.parse(
      (
        await doctor.agent
          .put(`/api/doctor/groups/${group.id}/photo`)
          .set('Origin', WEB_ORIGIN)
          .attach('file', photo, 'class.png')
          .expect(200)
      ).body,
    ).group;
    expect(updated.photoUrl).toMatch(/^\/api\/files\//);
    const image = await student.agent.get(updated.photoUrl ?? '').expect(200);
    expect((await sharp(image.body as Buffer).metadata()).width).toBe(512);
    expect((await view(student, group.id)).photoUrl).toBe(updated.photoUrl);

    await student.agent
      .put(`/api/doctor/groups/${group.id}/photo`)
      .set('Origin', WEB_ORIGIN)
      .expect(403);
    const cleared = await doctor.agent
      .delete(`/api/doctor/groups/${group.id}/photo`)
      .set('Origin', WEB_ORIGIN)
      .expect(200);
    expect(groupResponseSchema.parse(cleared.body).group.photoUrl).toBeNull();
  });
});
