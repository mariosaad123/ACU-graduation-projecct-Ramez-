import type { Agenda, AssistedGroup, Group, StudentGroup } from '@acu/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, nth, queueResponses, renderWithProviders } from '../../test/render';
import { ASSISTED_GROUPS_KEY, DOCTOR_GROUPS_KEY, STUDENT_GROUPS_KEY } from '../groups/api';
import { AttentionCard } from './AttentionCard';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_GROUP_ID = '22222222-2222-4222-8222-222222222222';
const ASSIGNMENT_ID = '44444444-4444-4444-8444-444444444444';
const AGENDA_KEY = ['agenda'] as const;
const NOTHING: Agenda = { toHandIn: [], toGrade: [] };

function studentGroup(overrides: Partial<StudentGroup> = {}): StudentGroup {
  return {
    id: GROUP_ID,
    name: 'German 1',
    description: null,
    language: 'de',
    photoUrl: null,
    doctorName: 'Dr. Mona',
    doctorAvatarUrl: null,
    status: 'active',
    joinedAt: '2026-09-30T10:00:00.000Z',
    unread: 0,
    unreadAnnouncements: 0,
    role: 'student',
    ...overrides,
  };
}

function ownGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: GROUP_ID,
    name: 'German 1',
    description: null,
    language: 'de',
    joinCode: 'K7QM9XRT',
    joinOpen: true,
    requiresApproval: true,
    chatOpen: true,
    chatSchedule: null,
    chatRateLimit: 60,
    photoUrl: null,
    archived: false,
    createdAt: '2026-09-30T10:00:00.000Z',
    counts: { active: 4, pending: 0, out: 0 },
    unread: 0,
    ...overrides,
  };
}

function assistedGroup(overrides: Partial<AssistedGroup> = {}): AssistedGroup {
  return {
    id: OTHER_GROUP_ID,
    name: 'French 2',
    language: 'fr',
    photoUrl: null,
    doctorName: 'Dr. Karim',
    archived: false,
    students: 12,
    unread: 0,
    role: 'assistant',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AttentionCard', () => {
  it('tells a student with nothing waiting that all is in order', () => {
    renderWithProviders(<AttentionCard role="student" />, {
      cache: [
        [AGENDA_KEY, NOTHING],
        [STUDENT_GROUPS_KEY, [studentGroup()]],
      ],
    });

    const card = screen.getByRole('region', { name: 'Needs your attention' });
    expect(within(card).getByText('Nothing is waiting for you. All is in order.')).toBeVisible();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
  });

  it('leads a student to the work to hand in, the announcements and the chat', () => {
    renderWithProviders(<AttentionCard role="student" />, {
      cache: [
        [
          AGENDA_KEY,
          {
            toHandIn: [
              {
                assignmentId: ASSIGNMENT_ID,
                title: 'Meine Stadt',
                groupId: GROUP_ID,
                groupName: 'German 1',
                dueAt: null,
                overdue: false,
              },
            ],
            toGrade: [],
          } satisfies Agenda,
        ],
        [STUDENT_GROUPS_KEY, [studentGroup({ unread: 3, unreadAnnouncements: 1 })]],
      ],
    });

    expect(screen.getByRole('link', { name: /Hand in: Meine Stadt/ })).toHaveAttribute(
      'href',
      `/app/groups/${GROUP_ID}?tab=assignments&assignment=${ASSIGNMENT_ID}`,
    );
    expect(screen.getByRole('link', { name: /Unread announcements: 1/ })).toHaveAttribute(
      'href',
      `/app/groups/${GROUP_ID}?tab=announcements`,
    );
    expect(screen.getByRole('link', { name: /New messages: 3/ })).toHaveAttribute(
      'href',
      `/app/groups/${GROUP_ID}?tab=chat`,
    );
  });

  it('puts overdue work first and says it is still accepted', () => {
    renderWithProviders(<AttentionCard role="student" />, {
      cache: [
        [
          AGENDA_KEY,
          {
            toHandIn: [
              {
                assignmentId: ASSIGNMENT_ID,
                title: 'Meine Stadt',
                groupId: GROUP_ID,
                groupName: 'German 1',
                dueAt: '2020-01-01T10:00:00.000Z',
                overdue: true,
              },
            ],
            toGrade: [],
          } satisfies Agenda,
        ],
        [STUDENT_GROUPS_KEY, [studentGroup({ unread: 2 })]],
      ],
    });

    const lines = screen.getAllByRole('listitem');
    expect(lines).toHaveLength(2);
    expect(nth(lines, 0)).toHaveTextContent('Hand in: Meine Stadt');
    expect(nth(lines, 0)).toHaveTextContent('past its deadline, still accepted');
    expect(nth(lines, 0)).toHaveAttribute('data-tone', 'urgent');
  });

  it('shows a request still waiting for the doctor without a link', () => {
    renderWithProviders(<AttentionCard role="student" />, {
      cache: [
        [AGENDA_KEY, NOTHING],
        [STUDENT_GROUPS_KEY, [studentGroup({ status: 'pending', unread: 5 })]],
      ],
    });

    expect(screen.getByText('Your request to join is waiting for the doctor')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('leads a doctor to join requests first, then grading and messages', () => {
    renderWithProviders(<AttentionCard role="doctor" />, {
      cache: [
        [
          AGENDA_KEY,
          {
            toHandIn: [],
            toGrade: [
              {
                assignmentId: ASSIGNMENT_ID,
                title: 'Meine Stadt',
                groupId: GROUP_ID,
                groupName: 'German 1',
                waiting: 4,
              },
            ],
          } satisfies Agenda,
        ],
        [
          DOCTOR_GROUPS_KEY,
          [
            ownGroup({ counts: { active: 4, pending: 2, out: 0 } }),
            ownGroup({ id: OTHER_GROUP_ID, name: 'Old group', archived: true, unread: 9 }),
          ],
        ],
        [ASSISTED_GROUPS_KEY, [assistedGroup({ unread: 6 })]],
      ],
    });

    const lines = screen.getAllByRole('listitem');
    expect(lines).toHaveLength(3);
    expect(nth(lines, 0)).toHaveTextContent('Join requests waiting for you: 2');
    expect(screen.getByRole('link', { name: /Join requests waiting for you: 2/ })).toHaveAttribute(
      'href',
      `/app/groups/${GROUP_ID}?tab=students`,
    );
    expect(screen.getByRole('link', { name: /Work waiting to be graded: 4/ })).toHaveAttribute(
      'href',
      `/app/groups/${GROUP_ID}?tab=assignments&review=${ASSIGNMENT_ID}`,
    );
    expect(screen.getByRole('link', { name: /New messages: 6/ })).toHaveAttribute(
      'href',
      `/app/groups/${OTHER_GROUP_ID}?tab=chat`,
    );
    expect(screen.queryByText('Old group')).not.toBeInTheDocument();
  });

  it('offers to try again when the list cannot be loaded, and recovers', async () => {
    const { fetchMock, calls } = queueResponses([500, apiError('INTERNAL')], [200, NOTHING]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<AttentionCard role="student" />, {
      cache: [[STUDENT_GROUPS_KEY, []]],
    });

    await userEvent.click(await screen.findByRole('button', { name: /try again/i }));

    expect(await screen.findByText('Nothing is waiting for you. All is in order.')).toBeVisible();
    expect(calls.map((call) => call.url)).toEqual(['/api/me/agenda', '/api/me/agenda']);
  });
});
