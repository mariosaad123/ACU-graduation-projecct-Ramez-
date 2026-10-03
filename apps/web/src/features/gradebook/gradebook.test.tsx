import {
  CAPABILITIES,
  type Activity,
  type Gradebook,
  type GradebookStudent,
  type GroupView,
  type MyGrades,
} from '@acu/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nth, queueResponses, renderWithProviders } from '../../test/render';
import { ActivityTab } from './ActivityTab';
import { gradebookKey } from './api';
import { GradebookTab } from './GradebookTab';
import { MyGradesTab } from './MyGradesTab';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const OMAR = '33333333-3333-4333-8333-333333333333';
const NOUR = '44444444-4444-4444-8444-444444444444';
const QUIZ = '55555555-5555-4555-8555-555555555555';

afterEach(() => {
  vi.unstubAllGlobals();
});

function view(role: GroupView['role']): GroupView {
  return {
    id: GROUP_ID,
    name: 'Deutsch 1',
    description: null,
    language: 'de',
    photoUrl: null,
    archived: false,
    doctor: { id: 'doctor-1', name: 'Dr. Mona', avatarUrl: null },
    isDoctor: role === 'owner',
    role,
    can: CAPABILITIES[role],
    unreadAnnouncements: 0,
    chat: {
      open: true,
      mode: 'open',
      schedule: null,
      manual: false,
      nextChange: null,
      muted: false,
      canPost: true,
      lastReadSeq: 0,
      rateLimit: 60,
    },
  };
}

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    messages: 4,
    messagesThisWeek: 2,
    lastMessageAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    announcementsRead: 1,
    pollsAnswered: 1,
    filesShared: 0,
    quiet: false,
    away: false,
    ...overrides,
  };
}

function student(overrides: Partial<GradebookStudent> = {}): GradebookStudent {
  return {
    id: OMAR,
    name: 'Omar Khaled',
    email: 'omar@gmail.com',
    avatarUrl: null,
    universityId: '20231234',
    status: 'active',
    joinedAt: '2026-09-30T10:00:00.000Z',
    activity: activity(),
    ...overrides,
  };
}

function gradebook(overrides: Partial<Gradebook> = {}): Gradebook {
  return {
    columns: [
      {
        id: QUIZ,
        title: 'Quiz 1',
        kind: 'quiz',
        maxScore: 10,
        weight: null,
        heldOn: '2026-09-28',
        published: true,
        position: 0,
        source: 'manual',
        assignmentId: null,
        createdAt: '2026-09-28T10:00:00.000Z',
      },
    ],
    students: [
      student(),
      student({
        id: NOUR,
        name: 'Nour Ali',
        universityId: null,
        activity: activity({ messagesThisWeek: 0, quiet: true, away: true, lastSeenAt: null }),
      }),
    ],
    grades: [
      {
        columnId: QUIZ,
        studentId: OMAR,
        status: 'scored',
        score: 4,
        note: null,
        updatedAt: '2026-09-28T10:00:00.000Z',
      },
    ],
    totals: { announcements: 1, polls: 1 },
    ...overrides,
  };
}

describe('the gradebook', () => {
  function renderSheet() {
    return renderWithProviders(<GradebookTab view={view('owner')} />, {
      cache: [[gradebookKey(GROUP_ID), gradebook()]],
    });
  }

  it('refuses a score above the column’s maximum, and says why', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses();
    vi.stubGlobal('fetch', fetchMock);
    renderSheet();

    const cell = screen.getByLabelText('Nour Ali’s score in Quiz 1');
    await user.type(cell, '11{Enter}');

    expect(cell).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findByText('Enter a number from 0 to 10.')).toBeInTheDocument();
    // The cell keeps the focus so the score can be corrected.
    expect(cell).toHaveFocus();
    expect(calls).toHaveLength(0);
  });

  it('saves a typed score, and a letter for an absent student', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([200, { grades: [] }], [200, gradebook()]);
    vi.stubGlobal('fetch', fetchMock);
    renderSheet();

    await user.type(screen.getByLabelText('Nour Ali’s score in Quiz 1'), 'a{Enter}');

    await vi.waitFor(() => {
      expect(nth(calls, 0)).toMatchObject({
        url: `/api/groups/${GROUP_ID}/gradebook/columns/${QUIZ}/grades`,
        init: {
          method: 'PUT',
          body: JSON.stringify({
            entries: [{ studentId: NOUR, status: 'absent', score: null, note: null }],
          }),
        },
      });
    });
  });
});

describe('a student’s own grades', () => {
  it('shows each published score with the class average and the total so far', () => {
    const grades: MyGrades = {
      columns: [
        {
          id: QUIZ,
          title: 'Quiz 1',
          kind: 'quiz',
          maxScore: 10,
          weight: null,
          heldOn: '2026-09-28',
          average: 6.25,
          grade: { status: 'scored', score: 9, note: 'Well done' },
        },
        {
          id: 'homework',
          title: 'Homework 2',
          kind: 'assignment',
          maxScore: 20,
          weight: null,
          heldOn: null,
          average: null,
          grade: null,
        },
      ],
    };
    renderWithProviders(<MyGradesTab view={view('student')} />, {
      cache: [[['group', GROUP_ID, 'my-grades'], grades]],
    });

    expect(screen.getByText('90.0%')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
    expect(screen.getByText('Well done')).toBeInTheDocument();
    expect(screen.getByText('Class average: 6.3')).toBeInTheDocument();
    expect(screen.getByText('Not recorded yet')).toBeInTheDocument();
  });

  it('says so when nothing is published yet', () => {
    renderWithProviders(<MyGradesTab view={view('student')} />, {
      cache: [[['group', GROUP_ID, 'my-grades'], { columns: [] }]],
    });

    expect(screen.getByText('No grades published yet.')).toBeInTheDocument();
  });
});

describe('student activity', () => {
  it('counts each student once and filters by state', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ActivityTab view={view('owner')} />, {
      cache: [[gradebookKey(GROUP_ID), gradebook()]],
    });

    expect(screen.getByRole('button', { name: /^2\s*All/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /^1\s*Active/ })).toBeInTheDocument();
    // Away already says quiet: the student is not counted twice.
    expect(screen.getByRole('button', { name: /^0\s*Quiet/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^1\s*Away/ }));
    expect(screen.getByText('Nour Ali')).toBeInTheDocument();
    expect(screen.queryByText('Omar Khaled')).not.toBeInTheDocument();
  });
});
