import type { GradebookStudent } from '@acu/shared';
import { describe, expect, it } from 'vitest';
import { readCell, readPastedGrades } from './grade-input';

function student(id: string, name: string, universityId: string | null): GradebookStudent {
  return {
    id,
    name,
    email: `${id}@gmail.com`,
    avatarUrl: null,
    universityId,
    status: 'active',
    joinedAt: '2026-09-30T10:00:00.000Z',
    activity: {
      messages: 0,
      messagesThisWeek: 0,
      lastMessageAt: null,
      lastSeenAt: null,
      announcementsRead: 0,
      pollsAnswered: 0,
      filesShared: 0,
      quiet: true,
      away: true,
    },
  };
}

const students = [
  student('omar', 'Omar Khaled', '2023-0417'),
  student('nour', 'Nour Ali', '2023-0522'),
  student('hana', 'Hana Adel', null),
];

describe('a typed cell', () => {
  it('reads scores in either kind of digits, and the marks for absent and excused', () => {
    expect(readCell('8.5', 10)).toEqual({ input: { status: 'scored', score: 8.5 } });
    expect(readCell('٧٫٥', 10)).toEqual({ input: { status: 'scored', score: 7.5 } });
    expect(readCell(' غ ', 10)).toEqual({ input: { status: 'absent', score: null } });
    expect(readCell('E', 10)).toEqual({ input: { status: 'excused', score: null } });
    expect(readCell('', 10)).toEqual({ input: null });
  });

  it('says why a value cannot be a score', () => {
    expect(readCell('eleven', 10)).toEqual({ problem: 'invalid' });
    expect(readCell('-1', 10)).toEqual({ problem: 'invalid' });
    expect(readCell('11', 10)).toEqual({ problem: 'tooHigh' });
  });
});

describe('grades pasted from a spreadsheet', () => {
  it('takes one column in the order of the sheet', () => {
    const rows = readPastedGrades('9\r\n\r\nA\r\n7.5\r\n', students, 10);

    expect(rows.map((row) => [row.student?.id, row.input?.status, row.input?.score])).toEqual([
      ['omar', 'scored', 9],
      ['nour', 'absent', null],
      ['hana', 'scored', 7.5],
    ]);
  });

  it('matches students by university number, email or name when a second column names them', () => {
    const rows = readPastedGrades(
      ['Nour Ali\t6', '2023-0417\t10', 'hana@gmail.com\t4'].join('\n'),
      students,
      10,
    );

    expect(rows.map((row) => [row.student?.id, row.input?.score, row.problem])).toEqual([
      ['nour', 6, null],
      ['omar', 10, null],
      ['hana', 4, null],
    ]);
  });

  it('points at each line it cannot use and keeps the rest', () => {
    const rows = readPastedGrades(
      ['2023-0417\t9', '9999\t5', 'Omar Khaled\t3', '2023-0522\t12', 'Hana Adel\tx'].join('\n'),
      students,
      10,
    );

    expect(rows.map((row) => row.problem)).toEqual([
      null,
      'unknownStudent',
      'repeated',
      'tooHigh',
      'invalid',
    ]);
  });

  it('flags lines beyond the number of students', () => {
    const rows = readPastedGrades('1\n2\n3\n4', students, 10);

    expect(rows.at(-1)?.problem).toBe('tooManyRows');
  });
});
