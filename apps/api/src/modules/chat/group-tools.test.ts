import {
  announcementReceiptsSchema,
  announcementResponseSchema,
  announcementsResponseSchema,
  chatMessageResponseSchema,
  gradebookSchema,
  groupFilesResponseSchema,
  groupViewResponseSchema,
  myGradesSchema,
  notificationsResponseSchema,
  type Group,
} from '@acu/shared';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

async function classroom() {
  const doctor = await signInAsDoctor(context);
  const omar = await signInAsStudent(context);
  const nour = await signInAsStudent(context);
  const group = await createGroup(doctor);
  for (const student of [omar, nour]) {
    await post(student.agent, '/api/student/join', { code: group.joinCode }).expect(201);
  }
  return { doctor, omar, nour, group };
}

const PDF = Buffer.from('%PDF-1.4\n%test\n');
/** The first bytes of an MP4 file: an "ftyp" box with the isom brand. */
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x20]),
  Buffer.from('ftypisom'),
  Buffer.alloc(64, 1),
]);

function upload(person: Person, groupId: string, data: Buffer, name: string, type: string) {
  return person.agent
    .post(`/api/groups/${groupId}/chat`)
    .set('Origin', WEB_ORIGIN)
    .attach('file', data, { filename: name, contentType: type });
}

function poll(person: Person, group: Group, overrides: Record<string, unknown> = {}) {
  return post(person.agent, `/api/groups/${group.id}/polls`, {
    question: 'When should the quiz be?',
    options: ['Monday', 'Wednesday'],
    multiple: false,
    anonymous: false,
    closesAt: null,
    ...overrides,
  });
}

function announce(person: Person, group: Group, title = 'Midterm room', files: Buffer[] = []) {
  let request = person.agent
    .post(`/api/groups/${group.id}/announcements`)
    .set('Origin', WEB_ORIGIN)
    .field('title', title)
    .field('body', 'The midterm is in hall 3 at 10:00.')
    .field('important', 'true');
  files.forEach((data, index) => {
    request = request.attach('files', data, {
      filename: `notes-${String(index)}.pdf`,
      contentType: 'application/pdf',
    });
  });
  return request;
}

/** The gradebook column in a response. */
function columnOf(response: { body: unknown }) {
  return (response.body as { column: { id: string } }).column;
}

function messageOf(response: { body: unknown }) {
  return chatMessageResponseSchema.parse(response.body).message;
}

function pollOf(response: { body: unknown }) {
  const { poll: found } = messageOf(response);
  if (!found) {
    throw new Error('The message carries no poll');
  }
  return found;
}

describe('polls', () => {
  it('asks the group a question and counts the votes as they come', async () => {
    const { doctor, omar, nour, group } = await classroom();
    const created = chatMessageResponseSchema.parse(
      (await poll(doctor, group).expect(201)).body,
    ).message;
    const pollId = created.poll?.id ?? '';
    const [monday, wednesday] = created.poll?.options ?? [];

    await post(omar.agent, `/api/groups/${group.id}/polls/${pollId}/vote`, {
      optionIds: [monday?.id],
    }).expect(200);
    const changed = await post(nour.agent, `/api/groups/${group.id}/polls/${pollId}/vote`, {
      optionIds: [wednesday?.id],
    }).expect(200);
    // Omar changes his mind.
    const final = await post(omar.agent, `/api/groups/${group.id}/polls/${pollId}/vote`, {
      optionIds: [wednesday?.id],
    }).expect(200);

    expect(pollOf(changed).voters).toBe(2);
    const result = pollOf(final);
    expect(result).toMatchObject({ voters: 2, myVotes: [wednesday?.id] });
    expect(result.options.map((option) => [option.text, option.votes])).toEqual([
      ['Monday', 0],
      ['Wednesday', 2],
    ]);
    expect(result.options[1]?.voters.map((voter) => voter.id).sort()).toEqual(
      [omar.id, nour.id].sort(),
    );
    const { notifications } = notificationsResponseSchema.parse(
      (await nour.agent.get('/api/notifications').expect(200)).body,
    );
    expect(notifications[0]).toMatchObject({ kind: 'poll', excerpt: 'When should the quiz be?' });
  });

  it('keeps an anonymous poll anonymous', async () => {
    const { doctor, omar, group } = await classroom();
    const created = pollOf(await poll(doctor, group, { anonymous: true }).expect(201));
    const voted = await post(omar.agent, `/api/groups/${group.id}/polls/${created.id}/vote`, {
      optionIds: [created.options[0]?.id],
    }).expect(200);

    expect(pollOf(voted).options[0]).toMatchObject({ votes: 1, voters: [] });
  });

  it('allows one choice unless the poll takes several', async () => {
    const { doctor, omar, group } = await classroom();
    const single = pollOf(await poll(doctor, group).expect(201));
    const ids = single.options.map((option) => option.id);

    await post(omar.agent, `/api/groups/${group.id}/polls/${single.id}/vote`, {
      optionIds: ids,
    }).expect(400);
    const multiple = pollOf(await poll(doctor, group, { multiple: true }).expect(201));
    await post(omar.agent, `/api/groups/${group.id}/polls/${multiple.id}/vote`, {
      optionIds: multiple.options.map((option) => option.id),
    }).expect(200);
  });

  it('stops votes once closed, by hand or by its closing time', async () => {
    const { doctor, omar, group } = await classroom();
    const first = pollOf(await poll(doctor, group).expect(201));
    await post(doctor.agent, `/api/groups/${group.id}/polls/${first.id}/close`).expect(200);
    const refused = await post(omar.agent, `/api/groups/${group.id}/polls/${first.id}/vote`, {
      optionIds: [first.options[0]?.id],
    }).expect(409);
    expect(errorOf(refused).code).toBe('POLL_CLOSED');

    const timed = pollOf(
      await poll(doctor, group, {
        closesAt: new Date(Date.parse('2026-10-04T08:00:00.000Z') + 60_000).toISOString(),
      }).expect(201),
    );
    context.advance(2 * 60_000);
    await post(omar.agent, `/api/groups/${group.id}/polls/${timed.id}/vote`, {
      optionIds: [timed.options[0]?.id],
    }).expect(409);
  });

  it('is asked by the staff and the roles, not by plain students', async () => {
    const { doctor, omar, group } = await classroom();
    await poll(omar, group).expect(403);
    await post(doctor.agent, `/api/doctor/groups/${group.id}/members/${omar.id}/role`, {
      role: 'representative',
    }).expect(200);
    await poll(omar, group).expect(201);
  });

  it('refuses options that repeat each other', async () => {
    const { doctor, group } = await classroom();
    await poll(doctor, group, { options: ['Monday', 'monday'] }).expect(400);
  });
});

describe('announcements', () => {
  it('posts with files, and shows the doctor who has read it', async () => {
    const { doctor, omar, nour, group } = await classroom();
    const created = announcementResponseSchema.parse(
      (await announce(doctor, group, 'Midterm room', [PDF]).expect(201)).body,
    ).announcement;
    expect(created).toMatchObject({ important: true, receipts: { read: 0, total: 2 } });
    expect(created.attachments).toHaveLength(1);

    const view = groupViewResponseSchema.parse(
      (await omar.agent.get(`/api/groups/${group.id}`).expect(200)).body,
    ).group;
    expect(view.unreadAnnouncements).toBe(1);
    await post(omar.agent, `/api/groups/${group.id}/announcements/read`, {
      ids: [created.id],
    }).expect(204);

    const list = announcementsResponseSchema.parse(
      (await doctor.agent.get(`/api/groups/${group.id}/announcements`).expect(200)).body,
    ).announcements;
    expect(list[0]?.receipts).toEqual({ read: 1, total: 2 });
    const receipts = announcementReceiptsSchema.parse(
      (
        await doctor.agent
          .get(`/api/groups/${group.id}/announcements/${created.id}/receipts`)
          .expect(200)
      ).body,
    );
    expect(receipts.read.map((person) => person.id)).toEqual([omar.id]);
    expect(receipts.unread.map((person) => person.id)).toEqual([nour.id]);
    // Students do not see who read it.
    const seenByNour = announcementsResponseSchema.parse(
      (await nour.agent.get(`/api/groups/${group.id}/announcements`).expect(200)).body,
    ).announcements;
    expect(seenByNour[0]).toMatchObject({ read: false, receipts: null, canEdit: false });
    await nour.agent
      .get(`/api/groups/${group.id}/announcements/${created.id}/receipts`)
      .expect(403);
  });

  it('lets the representative announce, and only its author or the staff change it', async () => {
    const { doctor, omar, nour, group } = await classroom();
    await announce(omar, group).expect(403);
    await post(doctor.agent, `/api/doctor/groups/${group.id}/members/${omar.id}/role`, {
      role: 'representative',
    }).expect(200);
    const created = announcementResponseSchema.parse(
      (await announce(omar, group).expect(201)).body,
    ).announcement;

    await send(nour.agent, 'patch', `/api/groups/${group.id}/announcements/${created.id}`, {
      title: 'Hacked',
    }).expect(403);
    const edited = await send(
      omar.agent,
      'patch',
      `/api/groups/${group.id}/announcements/${created.id}`,
      { title: 'Midterm in hall 4' },
    ).expect(200);
    expect(announcementResponseSchema.parse(edited.body).announcement).toMatchObject({
      title: 'Midterm in hall 4',
      edited: true,
    });
    await doctor.agent
      .delete(`/api/groups/${group.id}/announcements/${created.id}`)
      .set('Origin', WEB_ORIGIN)
      .expect(204);
    const list = announcementsResponseSchema.parse(
      (await nour.agent.get(`/api/groups/${group.id}/announcements`).expect(200)).body,
    );
    expect(list.announcements).toEqual([]);
  });

  it('takes at most five files', async () => {
    const { doctor, group } = await classroom();
    const response = await announce(
      doctor,
      group,
      'Many',
      Array.from({ length: 6 }, () => PDF),
    );
    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('TOO_MANY_FILES');
  });
});

describe('the files of a group', () => {
  it('sorts what was shared into images, videos, recordings and documents', async () => {
    const { doctor, omar, group } = await classroom();
    await upload(omar, group.id, PDF, 'Lektion 1.pdf', 'application/pdf').expect(201);
    const video = await upload(doctor, group.id, MP4, 'lesson.mp4', 'video/mp4').expect(201);
    await upload(omar, group.id, MP4, 'voice.m4a', 'audio/mp4').expect(201);
    await announce(doctor, group, 'Notes', [PDF]).expect(201);

    expect(messageOf(video).attachment).toMatchObject({
      kind: 'video',
      contentType: 'video/mp4',
    });
    const documents = groupFilesResponseSchema.parse(
      (await omar.agent.get(`/api/groups/${group.id}/files?kind=document`).expect(200)).body,
    );
    expect(documents.counts).toEqual({ image: 0, video: 1, audio: 1, document: 2 });
    expect(documents.files.map((file) => file.source).sort()).toEqual(['announcement', 'chat']);

    const searched = groupFilesResponseSchema.parse(
      (await omar.agent.get(`/api/groups/${group.id}/files?kind=document&q=lektion`).expect(200))
        .body,
    );
    expect(searched.files.map((file) => file.attachment.name)).toEqual(['Lektion 1.pdf']);
  });

  it('drops the file of a deleted message', async () => {
    const { omar, group } = await classroom();
    const sent = await upload(omar, group.id, PDF, 'draft.pdf', 'application/pdf').expect(201);
    await omar.agent
      .delete(`/api/groups/${group.id}/chat/${messageOf(sent).id}`)
      .set('Origin', WEB_ORIGIN)
      .expect(200);

    const documents = groupFilesResponseSchema.parse(
      (await omar.agent.get(`/api/groups/${group.id}/files?kind=document`)).body,
    );
    expect(documents.files).toEqual([]);
  });

  it('allows videos up to 25 MB but other files up to 10 MB', async () => {
    const { omar, group } = await classroom();
    const bigPdf = Buffer.concat([PDF, Buffer.alloc(11 * 1024 * 1024)]);
    const refused = await upload(omar, group.id, bigPdf, 'big.pdf', 'application/pdf');
    expect(refused.status).toBe(413);
    const bigVideo = Buffer.concat([MP4, Buffer.alloc(11 * 1024 * 1024)]);
    await upload(omar, group.id, bigVideo, 'class.mp4', 'video/mp4').expect(201);
  });

  it('is hidden from anyone outside the group', async () => {
    const { group } = await classroom();
    const outsider = await signInAsStudent(context);
    await outsider.agent.get(`/api/groups/${group.id}/files?kind=image`).expect(404);
  });
});

describe('the gradebook', () => {
  async function column(doctor: Person, group: Group, overrides: Record<string, unknown> = {}) {
    const response = await post(doctor.agent, `/api/groups/${group.id}/gradebook/columns`, {
      title: 'Quiz 1',
      kind: 'quiz',
      maxScore: 10,
      weight: null,
      heldOn: '2026-10-01',
      published: false,
      ...overrides,
    }).expect(201);
    return columnOf(response);
  }

  function grade(doctor: Person, group: Group, columnId: string, entries: object[]) {
    return send(
      doctor.agent,
      'put',
      `/api/groups/${group.id}/gradebook/columns/${columnId}/grades`,
      { entries },
    );
  }

  it('records scores, absences and excuses per student and column', async () => {
    const { doctor, omar, nour, group } = await classroom();
    const quiz = await column(doctor, group);
    await grade(doctor, group, quiz.id, [
      { studentId: omar.id, status: 'scored', score: 8.5, note: 'Good' },
      { studentId: nour.id, status: 'absent', score: null, note: null },
    ]).expect(200);

    const book = gradebookSchema.parse(
      (await doctor.agent.get(`/api/groups/${group.id}/gradebook`).expect(200)).body,
    );
    expect(book.columns).toMatchObject([{ title: 'Quiz 1', maxScore: 10, position: 0 }]);
    expect(book.students).toHaveLength(2);
    expect(book.grades).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentId: omar.id, score: 8.5, note: 'Good' }),
        expect.objectContaining({ studentId: nour.id, status: 'absent', score: null }),
      ]),
    );
  });

  it('refuses a score above the maximum, and a maximum below existing scores', async () => {
    const { doctor, omar, group } = await classroom();
    const quiz = await column(doctor, group);
    const high = await grade(doctor, group, quiz.id, [
      { studentId: omar.id, status: 'scored', score: 11, note: null },
    ]);
    expect(errorOf(high).code).toBe('SCORE_TOO_HIGH');
    await grade(doctor, group, quiz.id, [
      { studentId: omar.id, status: 'scored', score: 9, note: null },
    ]).expect(200);

    const lowered = await send(
      doctor.agent,
      'patch',
      `/api/groups/${group.id}/gradebook/columns/${quiz.id}`,
      { maxScore: 5 },
    ).expect(409);
    expect(errorOf(lowered).code).toBe('SCORE_TOO_HIGH');
  });

  it('shows students their published grades only, and tells them when one is published', async () => {
    const { doctor, omar, nour, group } = await classroom();
    const hidden = await column(doctor, group, { title: 'Draft' });
    const quiz = await column(doctor, group, { title: 'Quiz 1' });
    await grade(doctor, group, quiz.id, [
      { studentId: omar.id, status: 'scored', score: 6, note: null },
      { studentId: nour.id, status: 'scored', score: 10, note: null },
    ]).expect(200);
    await send(doctor.agent, 'patch', `/api/groups/${group.id}/gradebook/columns/${quiz.id}`, {
      published: true,
    }).expect(200);

    const mine = myGradesSchema.parse(
      (await omar.agent.get(`/api/groups/${group.id}/my-grades`).expect(200)).body,
    );
    expect(mine.columns).toEqual([
      expect.objectContaining({
        id: quiz.id,
        average: 8,
        grade: { status: 'scored', score: 6, note: null },
      }),
    ]);
    expect(mine.columns.some((entry) => entry.id === hidden.id)).toBe(false);
    const { notifications } = notificationsResponseSchema.parse(
      (await omar.agent.get('/api/notifications').expect(200)).body,
    );
    expect(notifications[0]).toMatchObject({ kind: 'grade', excerpt: 'Quiz 1', read: true });
  });

  it('reorders and deletes columns', async () => {
    const { doctor, group } = await classroom();
    const first = await column(doctor, group, { title: 'A' });
    const second = await column(doctor, group, { title: 'B' });
    const reordered = await send(doctor.agent, 'put', `/api/groups/${group.id}/gradebook/order`, {
      ids: [second.id, first.id],
    }).expect(200);
    expect(
      (reordered.body as { columns: { title: string }[] }).columns.map((entry) => entry.title),
    ).toEqual(['B', 'A']);
    await doctor.agent
      .delete(`/api/groups/${group.id}/gradebook/columns/${first.id}`)
      .set('Origin', WEB_ORIGIN)
      .expect(204);
  });

  it('keeps grades and activity from students', async () => {
    const { omar, group } = await classroom();
    await omar.agent.get(`/api/groups/${group.id}/gradebook`).expect(403);
  });

  it('counts how much each student takes part', async () => {
    const { doctor, omar, group } = await classroom();
    await omar.agent.get(`/api/groups/${group.id}`).expect(200);
    await post(omar.agent, `/api/groups/${group.id}/chat`).field('body', 'hello').expect(201);
    const created = pollOf(await poll(doctor, group).expect(201));
    await post(omar.agent, `/api/groups/${group.id}/polls/${created.id}/vote`, {
      optionIds: [created.options[0]?.id],
    }).expect(200);

    const book = gradebookSchema.parse(
      (await doctor.agent.get(`/api/groups/${group.id}/gradebook`).expect(200)).body,
    );
    const activity = book.students.find((student) => student.id === omar.id)?.activity;
    expect(activity).toMatchObject({
      messages: 1,
      messagesThisWeek: 1,
      pollsAnswered: 1,
      quiet: false,
      away: false,
    });
    expect(book.students.find((student) => student.id !== omar.id)?.activity).toMatchObject({
      quiet: true,
      away: true,
    });
    expect(book.totals).toEqual({ announcements: 0, polls: 1 });
  });
});

describe('exporting to Excel', () => {
  async function workbook(response: { body: Buffer }) {
    const book = new ExcelJS.Workbook();
    // exceljs types its input after an older Buffer definition.
    await book.xlsx.load(response.body as unknown as Parameters<typeof book.xlsx.load>[0]);
    return book;
  }

  function binary(request: ReturnType<Person['agent']['get']>) {
    return request.buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        done(null, Buffer.concat(chunks));
      });
    });
  }

  it('builds a full report with every sheet, in Arabic', async () => {
    const { doctor, omar, group } = await classroom();
    const quiz = columnOf(
      await post(doctor.agent, `/api/groups/${group.id}/gradebook/columns`, {
        title: 'Quiz 1',
        kind: 'quiz',
        maxScore: 10,
        weight: null,
        heldOn: null,
        published: true,
      }).expect(201),
    );
    await send(doctor.agent, 'put', `/api/groups/${group.id}/gradebook/columns/${quiz.id}/grades`, {
      entries: [{ studentId: omar.id, status: 'scored', score: 9, note: null }],
    }).expect(200);

    const response = await binary(
      doctor.agent.get(`/api/groups/${group.id}/export?report=full&lang=ar`),
    ).expect(200);
    expect(response.headers['content-type']).toContain('spreadsheetml');
    expect(response.headers['content-disposition']).toContain("filename*=UTF-8''");
    const book = await workbook(response);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
      'ملخص',
      'كشف الدرجات',
      'النشاط',
      'الإعلانات',
      'الاستطلاعات',
      'الأعضاء',
    ]);
    const grades = book.getWorksheet('كشف الدرجات');
    expect(grades?.views[0]?.rightToLeft).toBe(true);
    const header = grades?.getRow(4).values as unknown[];
    expect(String(header[5])).toContain('Quiz 1');
    const rows = [5, 6].map((row) => grades?.getRow(row).values as unknown[]);
    const omarRow = rows.find((values) => values.includes(9));
    expect(omarRow).toBeDefined();
    expect(omarRow).toContain(90);
    expect(omarRow).toContain('ممتاز');
  });

  it('builds an official grade sheet in English without emails', async () => {
    const { doctor, group } = await classroom();
    const response = await binary(
      doctor.agent.get(`/api/groups/${group.id}/export?report=grades&lang=en`),
    ).expect(200);
    const book = await workbook(response);

    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(['Grade sheet']);
    const header = book.worksheets[0]?.getRow(4).values as unknown[];
    expect(header).not.toContain('Email');
    expect(book.worksheets[0]?.views[0]?.rightToLeft).toBe(false);
  });

  it('puts all of a doctor’s groups in one workbook', async () => {
    const { doctor } = await classroom();
    await createGroup(doctor, { name: 'Conversation 3' });
    const response = await binary(doctor.agent.get('/api/doctor/export?lang=ar')).expect(200);
    const book = await workbook(response);

    const [overview, ...groupSheets] = book.worksheets.map((sheet) => sheet.name);
    expect(overview).toBe('كل المجموعات');
    expect(groupSheets.sort()).toEqual(['Conversation 2', 'Conversation 3']);
  });

  it('is for the staff only', async () => {
    const { omar, group } = await classroom();
    await omar.agent.get(`/api/groups/${group.id}/export`).expect(403);
  });
});
