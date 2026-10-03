import {
  agendaSchema,
  assignmentDetailSchema,
  assignmentResponseSchema,
  assignmentsResponseSchema,
  chatMessageResponseSchema,
  chatSearchResponseSchema,
  gradebookSchema,
  groupMembersResponseSchema,
  messageReactionsSchema,
  myGradesSchema,
  notificationsResponseSchema,
  nudgeResponseSchema,
  type Group,
} from '@acu/shared';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  me,
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

/** When every test context's clock starts. */
const START = Date.parse('2026-10-04T08:00:00.000Z');
const HOUR = 60 * 60 * 1000;

/** A context with a clock of its own, for tests that move time. */
async function withOwnClock<Result>(run: (timed: TestContext) => Promise<Result>) {
  const timed = await createTestContext({ shareDatabaseWith: context });
  try {
    return await run(timed);
  } finally {
    await timed.close();
  }
}

async function classroom(from: TestContext = context) {
  const doctor = await signInAsDoctor(from);
  const omar = await signInAsStudent(from);
  const nour = await signInAsStudent(from);
  const group = await createGroup(doctor);
  for (const student of [omar, nour]) {
    await post(student.agent, '/api/student/join', { code: group.joinCode }).expect(201);
  }
  return { doctor, omar, nour, group };
}

const PDF = Buffer.from('%PDF-1.4\n%test\n');

async function say(person: Person, groupId: string, body: string) {
  const response = await person.agent
    .post(`/api/groups/${groupId}/chat`)
    .set('Origin', WEB_ORIGIN)
    .field('body', body)
    .expect(201);
  return chatMessageResponseSchema.parse(response.body).message;
}

function react(person: Person, groupId: string, messageId: string, emoji: string | null) {
  return send(person.agent, 'put', `/api/groups/${groupId}/chat/${messageId}/reaction`, { emoji });
}

async function assign(doctor: Person, group: Group, overrides: Record<string, unknown> = {}) {
  const response = await doctor.agent
    .post(`/api/groups/${group.id}/assignments`)
    .set('Origin', WEB_ORIGIN)
    .field(
      'data',
      JSON.stringify({
        title: 'Essay 1',
        instructions: 'Write 200 words about your city.',
        kind: 'assignment',
        maxScore: 20,
        dueAt: null,
        allowLate: true,
        ...overrides,
      }),
    )
    .attach('files', PDF, { filename: 'brief.pdf', contentType: 'application/pdf' })
    .expect(201);
  return assignmentResponseSchema.parse(response.body).assignment;
}

function handIn(
  student: Person,
  groupId: string,
  assignmentId: string,
  body: string,
  files: Buffer[] = [],
) {
  let request = student.agent
    .put(`/api/groups/${groupId}/assignments/${assignmentId}/submission`)
    .set('Origin', WEB_ORIGIN)
    .field('data', JSON.stringify({ body, keepFileIds: [] }));
  files.forEach((data, index) => {
    request = request.attach('files', data, {
      filename: `essay-${String(index)}.pdf`,
      contentType: 'application/pdf',
    });
  });
  return request;
}

async function listFor(person: Person, groupId: string) {
  const response = await person.agent.get(`/api/groups/${groupId}/assignments`).expect(200);
  return assignmentsResponseSchema.parse(response.body).assignments;
}

describe('university numbers', () => {
  it('asks every new student for one and keeps it to one account', async () => {
    const first = await signIn(context, identity());
    const request = { languages: ['en'], activeLanguage: 'en', goal: 'study' };
    const missing = await post(first.agent, '/api/onboarding/student', request).expect(400);
    expect(
      (missing.body as { error: { fields: Record<string, string> } }).error.fields,
    ).toHaveProperty('universityId');

    await post(first.agent, '/api/onboarding/student', {
      ...request,
      universityId: 'uni-777',
    }).expect(200);
    expect((await me(first.agent)).student?.universityId).toBe('UNI-777');

    const second = await signIn(context, identity());
    const taken = await post(second.agent, '/api/onboarding/student', {
      ...request,
      universityId: 'UNI-777',
    }).expect(409);
    expect(errorOf(taken).code).toBe('UNIVERSITY_ID_TAKEN');
    // Nothing was created: the second person can simply try again with their own number.
    expect((await me(second.agent)).role).toBeNull();
  });

  it('lets a student correct the number, never clear it or take someone else’s', async () => {
    const omar = await signInAsStudent(context);
    const nour = await signInAsStudent(context);
    const taken = (await me(nour.agent)).student?.universityId ?? '';

    await send(omar.agent, 'put', '/api/me/university-id', { universityId: '2021-555' }).expect(
      200,
    );
    expect((await me(omar.agent)).student?.universityId).toBe('2021-555');
    await send(omar.agent, 'put', '/api/me/university-id', { universityId: null }).expect(400);
    const response = await send(omar.agent, 'put', '/api/me/university-id', {
      universityId: taken,
    }).expect(409);
    expect(errorOf(response).code).toBe('UNIVERSITY_ID_TAKEN');
  });

  it('shows the doctor each student’s number and adds a student by it', async () => {
    const { doctor, omar, group } = await classroom();
    const number = (await me(omar.agent)).student?.universityId ?? '';
    const members = groupMembersResponseSchema.parse(
      (await doctor.agent.get(`/api/doctor/groups/${group.id}/members`).expect(200)).body,
    ).members;
    expect(members.find((member) => member.student.id === omar.id)?.student.universityId).toBe(
      number,
    );

    const other = await createGroup(doctor, { name: 'Second section' });
    await post(doctor.agent, `/api/doctor/groups/${other.id}/members`, {
      identifier: number.toLowerCase(),
    }).expect(201);
  });
});

describe('reactions', () => {
  it('keeps one reaction per person and counts them for everyone', async () => {
    const { doctor, omar, nour, group } = await classroom();
    const message = await say(doctor, group.id, 'The quiz is on Monday');

    await react(omar, group.id, message.id, '👍').expect(200);
    await react(nour, group.id, message.id, '👍').expect(200);
    const changed = await react(omar, group.id, message.id, '❤️').expect(200);
    expect(chatMessageResponseSchema.parse(changed.body).message.reactions).toEqual([
      { emoji: '❤️', count: 1, mine: true },
      { emoji: '👍', count: 1, mine: false },
    ]);

    const people = messageReactionsSchema.parse(
      (await doctor.agent.get(`/api/groups/${group.id}/chat/${message.id}/reactions`).expect(200))
        .body,
    );
    expect(people.reactions.map((entry) => [entry.emoji, entry.people.length])).toEqual(
      expect.arrayContaining([
        ['👍', 1],
        ['❤️', 1],
      ]),
    );

    const removed = await react(omar, group.id, message.id, null).expect(200);
    expect(chatMessageResponseSchema.parse(removed.body).message.reactions).toEqual([
      { emoji: '👍', count: 1, mine: false },
    ]);
  });

  it('reaches people already reading through the change feed', async () => {
    const { doctor, omar, group } = await classroom();
    const message = await say(doctor, group.id, 'Clear so far?');
    await react(omar, group.id, message.id, '✅').expect(200);

    const changes = await doctor.agent
      .get(`/api/groups/${group.id}/chat/changes?since=${String(message.version)}`)
      .expect(200);
    const [changed] = (changes.body as { messages: { id: string; reactions: unknown[] }[] })
      .messages;
    expect(changed?.id).toBe(message.id);
    expect(changed?.reactions).toHaveLength(1);
  });

  it('takes one emoji only, and nothing from outside the group', async () => {
    const { doctor, omar, group } = await classroom();
    const outsider = await signInAsStudent(context);
    const message = await say(doctor, group.id, 'Hello');

    for (const emoji of ['ok', '👍👍', '', '<b>']) {
      await react(omar, group.id, message.id, emoji).expect(400);
    }
    await react(outsider, group.id, message.id, '👍').expect(404);
  });
});

describe('searching the chat', () => {
  it('finds messages by their words and narrows them down', async () => {
    const { doctor, omar, group } = await classroom();
    await say(doctor, group.id, 'Chapter 3 is about the past tense');
    await say(omar, group.id, 'Is the past tense in the quiz?');
    const mention = await say(doctor, group.id, `@[${omar.id}] yes it is`);
    await post(doctor.agent, `/api/groups/${group.id}/chat/${mention.id}/pin`).expect(200);

    const search = async (person: Person, query: string) =>
      chatSearchResponseSchema.parse(
        (await person.agent.get(`/api/groups/${group.id}/chat/search?${query}`).expect(200)).body,
      ).messages;

    expect((await search(omar, 'q=PAST%20tense')).map((message) => message.author.id)).toEqual([
      omar.id,
      doctor.id,
    ]);
    expect(await search(omar, 'q=past%20tense&filter=staff')).toHaveLength(1);
    expect((await search(omar, 'filter=mentions'))[0]?.id).toBe(mention.id);
    expect((await search(doctor, 'filter=pinned'))[0]?.id).toBe(mention.id);
    // A percent sign is searched for, not treated as "anything".
    expect(await search(omar, 'q=%25%25')).toHaveLength(0);
  });

  it('asks for at least two characters, and hides the chat from outsiders', async () => {
    const { omar, group } = await classroom();
    const outsider = await signInAsStudent(context);

    await omar.agent.get(`/api/groups/${group.id}/chat/search?q=a`).expect(400);
    await outsider.agent.get(`/api/groups/${group.id}/chat/search?q=quiz`).expect(404);
  });
});

describe('assignments', () => {
  it('creates a hidden gradebook column with the assignment and tells the students', async () => {
    const { doctor, omar, group } = await classroom();
    const assignment = await assign(doctor, group);

    expect(assignment.attachments).toHaveLength(1);
    expect(assignment.progress).toEqual({ students: 2, submitted: 0, graded: 0, released: false });
    const gradebook = gradebookSchema.parse(
      (await doctor.agent.get(`/api/groups/${group.id}/gradebook`).expect(200)).body,
    );
    expect(gradebook.columns).toEqual([
      expect.objectContaining({
        id: assignment.columnId,
        title: 'Essay 1',
        maxScore: 20,
        published: false,
        source: 'assignment',
        assignmentId: assignment.id,
      }),
    ]);

    const { notifications } = notificationsResponseSchema.parse(
      (await omar.agent.get('/api/notifications').expect(200)).body,
    );
    expect(notifications[0]).toMatchObject({
      kind: 'assignment',
      excerpt: 'Essay 1',
      link: `/app/groups/${group.id}?tab=assignments&assignment=${assignment.id}`,
    });
    // The column cannot be removed from under the assignment.
    const refused = await doctor.agent
      .delete(`/api/groups/${group.id}/gradebook/columns/${assignment.columnId}`)
      .set('Origin', WEB_ORIGIN)
      .expect(409);
    expect(errorOf(refused).code).toBe('COLUMN_HAS_ASSIGNMENT');
  });

  it('takes a student’s work, lets them replace it, and keeps it from classmates', async () => {
    const { doctor, omar, nour, group } = await classroom();
    const assignment = await assign(doctor, group);

    await handIn(omar, group.id, assignment.id, '').expect(400);
    const first = await handIn(omar, group.id, assignment.id, 'My city is Cairo.', [PDF]).expect(
      200,
    );
    const mine = assignmentResponseSchema.parse(first.body).assignment.mine;
    expect(mine).toMatchObject({ state: 'submitted', canSubmit: true });
    const fileUrl = mine?.submission?.files[0]?.url ?? '';

    await omar.agent.get(fileUrl).expect(200);
    await doctor.agent.get(fileUrl).expect(200);
    await nour.agent.get(fileUrl).expect(404);

    await handIn(omar, group.id, assignment.id, 'My city is Giza.').expect(200);
    const [seen] = await listFor(omar, group.id);
    expect(seen?.mine?.submission).toMatchObject({ body: 'My city is Giza.', files: [] });
    // The replaced file is gone for good.
    await omar.agent.get(fileUrl).expect(404);
    expect((await listFor(nour, group.id))[0]?.mine).toMatchObject({
      state: 'missing',
      submission: null,
    });
    await handIn(doctor, group.id, assignment.id, 'Not a student').expect(403);
  });

  it('puts the doctor’s grade in the gradebook, and shows it once released', async () => {
    const { doctor, omar, group } = await classroom();
    const assignment = await assign(doctor, group);
    await handIn(omar, group.id, assignment.id, 'My city is Cairo.').expect(200);

    const gradePath = `/api/groups/${group.id}/assignments/${assignment.id}/submissions/${omar.id}/grade`;
    const tooHigh = await send(doctor.agent, 'put', gradePath, {
      status: 'scored',
      score: 25,
      note: null,
    }).expect(400);
    expect(errorOf(tooHigh).code).toBe('SCORE_TOO_HIGH');
    await send(doctor.agent, 'put', gradePath, {
      status: 'scored',
      score: 17.5,
      note: 'Good structure',
    }).expect(200);

    const detail = assignmentDetailSchema.parse(
      (await doctor.agent.get(`/api/groups/${group.id}/assignments/${assignment.id}`).expect(200))
        .body,
    );
    expect(detail.assignment.progress).toMatchObject({ submitted: 1, graded: 1 });
    expect(detail.submissions.map((row) => row.state).sort()).toEqual(['graded', 'missing']);
    const gradebook = gradebookSchema.parse(
      (await doctor.agent.get(`/api/groups/${group.id}/gradebook`).expect(200)).body,
    );
    expect(gradebook.grades).toEqual([
      expect.objectContaining({ columnId: assignment.columnId, studentId: omar.id, score: 17.5 }),
    ]);

    // Graded work stays as it was graded, and the score waits for the release.
    const locked = await handIn(omar, group.id, assignment.id, 'A second try').expect(409);
    expect(errorOf(locked).code).toBe('SUBMISSION_LOCKED');
    expect((await listFor(omar, group.id))[0]?.mine).toMatchObject({
      state: 'submitted',
      grade: null,
    });

    await doctor.agent
      .patch(`/api/groups/${group.id}/assignments/${assignment.id}`)
      .set('Origin', WEB_ORIGIN)
      .field('data', JSON.stringify({ released: true }))
      .expect(200);
    expect((await listFor(omar, group.id))[0]?.mine).toMatchObject({
      state: 'graded',
      grade: { status: 'scored', score: 17.5, note: 'Good structure' },
    });
    const grades = myGradesSchema.parse(
      (await omar.agent.get(`/api/groups/${group.id}/my-grades`).expect(200)).body,
    );
    expect(grades.columns[0]?.grade?.score).toBe(17.5);
    await omar.agent.get(`/api/groups/${group.id}/assignments/${assignment.id}`).expect(403);
  });

  it('marks late work, and refuses it once closed', () =>
    withOwnClock(async (timed) => {
      const { doctor, omar, nour, group } = await classroom(timed);
      const dueAt = new Date(START + HOUR).toISOString();
      const assignment = await assign(doctor, group, { dueAt, allowLate: true });
      const strict = await assign(doctor, group, { title: 'Essay 2', dueAt, allowLate: false });

      timed.advance(2 * HOUR);
      const late = await handIn(omar, group.id, assignment.id, 'Sorry, late.').expect(200);
      expect(assignmentResponseSchema.parse(late.body).assignment.mine?.state).toBe('late');
      const refused = await handIn(omar, group.id, strict.id, 'Too late').expect(409);
      expect(errorOf(refused).code).toBe('ASSIGNMENT_CLOSED');

      await doctor.agent
        .patch(`/api/groups/${group.id}/assignments/${assignment.id}`)
        .set('Origin', WEB_ORIGIN)
        .field('data', JSON.stringify({ closed: true }))
        .expect(200);
      await handIn(nour, group.id, assignment.id, 'Closed?').expect(409);
    }));

  it('deletes an assignment with its column and what was handed in', async () => {
    const { doctor, omar, group } = await classroom();
    const assignment = await assign(doctor, group);
    const handed = await handIn(omar, group.id, assignment.id, 'Text', [PDF]).expect(200);
    const fileUrl =
      assignmentResponseSchema.parse(handed.body).assignment.mine?.submission?.files[0]?.url ?? '';

    await omar.agent
      .delete(`/api/groups/${group.id}/assignments/${assignment.id}`)
      .set('Origin', WEB_ORIGIN)
      .expect(403);
    await doctor.agent
      .delete(`/api/groups/${group.id}/assignments/${assignment.id}`)
      .set('Origin', WEB_ORIGIN)
      .expect(204);

    expect(await listFor(doctor, group.id)).toEqual([]);
    const gradebook = gradebookSchema.parse(
      (await doctor.agent.get(`/api/groups/${group.id}/gradebook`).expect(200)).body,
    );
    expect(gradebook.columns).toEqual([]);
    await omar.agent.get(fileUrl).expect(404);
  });

  it('lists who handed in what in the full report', async () => {
    const { doctor, omar, group } = await classroom();
    const assignment = await assign(doctor, group);
    await handIn(omar, group.id, assignment.id, 'My city is Cairo.').expect(200);

    const response = await doctor.agent
      .get(`/api/groups/${group.id}/export?report=full&lang=en`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          done(null, Buffer.concat(chunks));
        });
      })
      .expect(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(response.body as ArrayBuffer);
    const sheet = book.getWorksheet('Assignments');
    const cells = [5, 6].map((row) => sheet?.getCell(row, 4).text ?? '');
    expect(cells.filter((cell) => cell.startsWith('Handed in'))).toHaveLength(1);
    expect(cells).toContain('Not handed in');
    expect(sheet?.getCell(8, 4).text).toBe('1 / 2');
  });
});

describe('the agenda on the dashboard', () => {
  it('lists what a student still has to hand in, and what the doctor still has to grade', async () => {
    const { doctor, omar, nour, group } = await classroom();
    const assignment = await assign(doctor, group);
    const agendaOf = async (person: Person) =>
      agendaSchema.parse((await person.agent.get('/api/me/agenda').expect(200)).body);

    expect((await agendaOf(omar)).toHandIn).toEqual([
      {
        assignmentId: assignment.id,
        title: 'Essay 1',
        groupId: group.id,
        groupName: group.name,
        dueAt: null,
        overdue: false,
      },
    ]);
    expect((await agendaOf(doctor)).toGrade).toEqual([]);

    await handIn(omar, group.id, assignment.id, 'My city is Cairo.').expect(200);
    await handIn(nour, group.id, assignment.id, 'My city is Giza.').expect(200);
    expect((await agendaOf(omar)).toHandIn).toEqual([]);
    expect((await agendaOf(doctor)).toGrade).toEqual([
      expect.objectContaining({ assignmentId: assignment.id, waiting: 2 }),
    ]);

    await send(
      doctor.agent,
      'put',
      `/api/groups/${group.id}/assignments/${assignment.id}/submissions/${omar.id}/grade`,
      { status: 'scored', score: 15, note: null },
    ).expect(200);
    expect((await agendaOf(doctor)).toGrade[0]?.waiting).toBe(1);
    // Groups that are someone else's never show up.
    const stranger = await signInAsDoctor(context);
    expect((await agendaOf(stranger)).toGrade).toEqual([]);
  });

  it('leaves out assignments that no longer take work and marks overdue ones', () =>
    withOwnClock(async (timed) => {
      const { doctor, omar, group } = await classroom(timed);
      const dueAt = new Date(START + HOUR).toISOString();
      await assign(doctor, group, { title: 'Late allowed', dueAt, allowLate: true });
      await assign(doctor, group, { title: 'Strict', dueAt, allowLate: false });
      timed.advance(2 * HOUR);

      const agenda = agendaSchema.parse((await omar.agent.get('/api/me/agenda').expect(200)).body);
      expect(agenda.toHandIn.map((item) => [item.title, item.overdue])).toEqual([
        ['Late allowed', true],
      ]);
    }));
});

describe('reminders', () => {
  it('reminds students once, then leaves them alone for a while', () =>
    withOwnClock(async (timed) => {
      const { doctor, omar, nour, group } = await classroom(timed);
      const path = `/api/groups/${group.id}/nudges`;

      const first = nudgeResponseSchema.parse(
        (
          await post(doctor.agent, path, {
            studentIds: [omar.id],
            reason: 'inactive',
          }).expect(200)
        ).body,
      );
      expect(first).toEqual({ sent: 1, skipped: 0 });
      const { notifications } = notificationsResponseSchema.parse(
        (await omar.agent.get('/api/notifications').expect(200)).body,
      );
      expect(notifications[0]).toMatchObject({ kind: 'nudge', excerpt: 'nudge:inactive' });

      const again = nudgeResponseSchema.parse(
        (
          await post(doctor.agent, path, {
            studentIds: [omar.id, nour.id],
            reason: 'inactive',
            note: 'We miss you in class',
          }).expect(200)
        ).body,
      );
      expect(again).toEqual({ sent: 1, skipped: 1 });

      timed.advance(13 * HOUR);
      const later = await post(doctor.agent, path, {
        studentIds: [omar.id],
        reason: 'inactive',
      }).expect(200);
      expect(nudgeResponseSchema.parse(later.body).sent).toBe(1);
    }));

  it('is for the staff, about something real in the group', async () => {
    const { doctor, omar, nour, group } = await classroom();
    const path = `/api/groups/${group.id}/nudges`;

    await post(omar.agent, path, { studentIds: [nour.id], reason: 'inactive' }).expect(403);
    await post(doctor.agent, path, { studentIds: [omar.id], reason: 'assignment' }).expect(400);
    await post(doctor.agent, path, {
      studentIds: [omar.id],
      reason: 'assignment',
      targetId: '11111111-1111-4111-8111-111111111111',
    }).expect(404);

    const assignment = await assign(doctor, group);
    await post(doctor.agent, path, {
      studentIds: [omar.id],
      reason: 'assignment',
      targetId: assignment.id,
    }).expect(200);
    const { notifications } = notificationsResponseSchema.parse(
      (await omar.agent.get('/api/notifications').expect(200)).body,
    );
    expect(notifications.find((entry) => entry.kind === 'nudge')).toMatchObject({
      excerpt: 'nudge:assignment',
      link: `/app/groups/${group.id}?tab=assignments&assignment=${assignment.id}`,
    });
  });
});
