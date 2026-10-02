import type { Group, GroupMember, LearningLanguage, SessionUser, StudentGroup } from '@acu/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, nth, queueResponses, renderWithProviders, sessionUser } from '../../test/render';
import { DOCTOR_GROUPS_KEY, STUDENT_GROUPS_KEY } from './api';
import { DoctorGroupsSection } from './DoctorGroupsSection';
import { GroupPage } from './GroupPage';
import { StudentGroupPage } from './StudentGroupPage';
import { JoinPage } from './JoinPage';
import { StudentGroupsCard } from './StudentGroupsCard';
import { TeachingLanguagesCard } from './TeachingLanguagesCard';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_GROUP_ID = '22222222-2222-4222-8222-222222222222';
const STUDENT_ID = '33333333-3333-4333-8333-333333333333';

function group(overrides: Partial<Group> = {}): Group {
  return {
    id: GROUP_ID,
    name: 'Conversation 2',
    description: 'Mondays 10:00',
    language: 'fr',
    joinCode: 'K7QM9XRT',
    joinOpen: true,
    requiresApproval: false,
    chatOpen: true,
    chatRateLimit: 60,
    photoUrl: null,
    archived: false,
    createdAt: '2026-09-30T10:00:00.000Z',
    counts: { active: 0, pending: 0, out: 0 },
    unread: 0,
    ...overrides,
  };
}

function member(overrides: Partial<GroupMember> = {}): GroupMember {
  return {
    student: {
      id: STUDENT_ID,
      name: 'Omar Khaled',
      email: 'omar@gmail.com',
      avatarUrl: null,
      languages: ['ja', 'fr'],
      activeLanguage: 'ja',
      suspension: null,
    },
    status: 'active',
    chatMuted: false,
    joinedAt: '2026-09-30T10:00:00.000Z',
    decidedAt: '2026-09-30T10:00:00.000Z',
    removedAt: null,
    leftByThemselves: false,
    ...overrides,
  };
}

function bodyOf(call: { init: RequestInit | undefined }): unknown {
  const body = call.init?.body;
  return typeof body === 'string' ? JSON.parse(body) : undefined;
}

const studentUser = (languages: LearningLanguage[] = ['en']): SessionUser =>
  sessionUser({
    role: 'student',
    student: { activeLanguage: languages[0] ?? 'en', languages, goal: 'study' },
  });

const doctorUser = sessionUser({
  role: 'doctor',
  doctor: {
    status: 'active',
    displayName: 'Dr. Mona',
    staffId: 'ACU-1',
    universityEmail: 'mona@acu.edu.eg',
    languages: ['fr', 'de'],
  },
});

afterEach(() => {
  sessionStorage.clear();
});

describe('the doctor’s groups on the dashboard', () => {
  it('explains the first steps when there are no groups', () => {
    renderWithProviders(<DoctorGroupsSection languages={['fr']} />, {
      route: '/app',
      cache: [[DOCTOR_GROUPS_KEY, []]],
    });

    expect(screen.getByText('You have no groups yet')).toBeInTheDocument();
    expect(screen.getByText(/Share the code or the join link/)).toBeInTheDocument();
  });

  it('asks for the languages taught before any group can be created', () => {
    renderWithProviders(<DoctorGroupsSection languages={[]} />, {
      route: '/app',
      cache: [[DOCTOR_GROUPS_KEY, []]],
    });

    expect(screen.queryByRole('button', { name: 'Create a group' })).not.toBeInTheDocument();
    expect(screen.getByText('Choose the languages you teach first.')).toBeInTheDocument();
  });

  it('shows each group with its code, and keeps archived ones apart', () => {
    renderWithProviders(<DoctorGroupsSection languages={['fr']} />, {
      route: '/app',
      cache: [
        [
          DOCTOR_GROUPS_KEY,
          [
            group({ counts: { active: 12, pending: 2, out: 1 }, requiresApproval: true }),
            group({ id: OTHER_GROUP_ID, name: 'Last term', archived: true }),
          ],
        ],
      ],
    });

    expect(screen.getByText('K7QM-9XRT')).toBeInTheDocument();
    expect(screen.getByText('Students: 12')).toBeInTheDocument();
    expect(screen.getByText('Requests to join: 2')).toBeInTheDocument();
    expect(screen.getByText('With your approval')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage “Conversation 2”' })).toHaveAttribute(
      'href',
      `/app/groups/${GROUP_ID}`,
    );
    expect(screen.getByText('Archived groups (1)')).toBeInTheDocument();
  });

  it('checks the new group before creating it, then opens it', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([201, { group: group() }], [200, { groups: [] }]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<DoctorGroupsSection languages={['fr', 'de']} />, {
      route: '/app',
      cache: [[DOCTOR_GROUPS_KEY, []]],
      extraRoutes: { '/app/groups/:groupId': <p>group page</p> },
    });

    await user.click(screen.getByRole('button', { name: 'Create a group' }));
    const dialog = screen.getByRole('dialog', { name: 'Create a group' });
    await user.click(within(dialog).getByRole('button', { name: 'Create the group' }));

    expect(within(dialog).getByLabelText(/Group name/)).toHaveAccessibleDescription(
      /Use a name of 3 to 80 characters/,
    );
    expect(within(dialog).getByLabelText(/Group language/)).toHaveAccessibleDescription(
      /Choose the group’s language/,
    );
    expect(calls).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/Group name/), 'Conversation 2');
    await user.selectOptions(within(dialog).getByLabelText(/Group language/), 'fr');
    await user.click(within(dialog).getByLabelText(/I approve every student/));
    await user.click(within(dialog).getByRole('button', { name: 'Create the group' }));

    expect(await screen.findByText('group page')).toBeInTheDocument();
    expect(bodyOf(nth(calls, 0))).toEqual({
      name: 'Conversation 2',
      description: null,
      language: 'fr',
      requiresApproval: true,
    });
  });

  it('opens the dialog on the language chosen on the home page', () => {
    renderWithProviders(<DoctorGroupsSection languages={['fr', 'de']} />, {
      route: '/app?newGroup=de',
      cache: [[DOCTOR_GROUPS_KEY, []]],
    });

    const dialog = screen.getByRole('dialog', { name: 'Create a group' });
    expect(within(dialog).getByLabelText(/Group language/)).toHaveValue('de');
  });
});

describe('the languages a doctor teaches', () => {
  it('saves a new choice, and explains why a language with groups cannot go', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([409, apiError('LANGUAGE_IN_USE')]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<TeachingLanguagesCard languages={['fr']} />, { session: doctorUser });

    await user.click(screen.getByRole('button', { name: 'Edit languages' }));
    const dialog = screen.getByRole('dialog', { name: 'Languages you teach' });
    await user.click(within(dialog).getByRole('checkbox', { name: /Français/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByRole('group')).toHaveAccessibleDescription(
      'Choose at least one language you teach.',
    );

    await user.click(within(dialog).getByRole('checkbox', { name: /Deutsch/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /A language you still have groups in/,
    );
    expect(nth(calls, 0)).toMatchObject({
      url: '/api/doctor/languages',
      init: { method: 'PUT', body: JSON.stringify({ languages: ['de'] }) },
    });
  });
});

describe('a group’s page', () => {
  function renderGroup(members: GroupMember[], overrides: Partial<Group> = {}, tab = 'students') {
    return renderWithProviders(<GroupPage />, {
      route: `/app/groups/${GROUP_ID}?tab=${tab}`,
      path: '/app/groups/:groupId',
      session: doctorUser,
      cache: [
        [DOCTOR_GROUPS_KEY, [group(overrides), group({ id: OTHER_GROUP_ID, name: 'Deutsch 1' })]],
        [['doctor', 'groups', GROUP_ID, 'members'], members],
      ],
    });
  }

  it('shows the code to share and sorts the students into tabs', () => {
    renderGroup([
      member(),
      member({
        student: { ...member().student, id: 'pending-1', name: 'Nour Ali' },
        status: 'pending',
      }),
      member({
        student: { ...member().student, id: 'left-1', name: 'Hana Adel' },
        status: 'left',
        leftByThemselves: true,
        removedAt: '2026-09-30T12:00:00.000Z',
      }),
    ]);

    expect(screen.getByRole('heading', { level: 1, name: 'Conversation 2' })).toBeInTheDocument();
    expect(screen.getByText('K7QM-9XRT')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Students (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Requests (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Out of the group (1)' })).toBeInTheDocument();
    expect(screen.getByText('Omar Khaled')).toBeInTheDocument();
  });

  it('approves a request to join', async () => {
    const user = userEvent.setup();
    const pending = member({ status: 'pending' });
    const { fetchMock, calls } = queueResponses(
      [200, { member: member() }],
      [200, { groups: [group()] }],
      [200, { members: [member()] }],
    );
    vi.stubGlobal('fetch', fetchMock);
    renderGroup([pending]);

    await user.click(screen.getByRole('tab', { name: 'Requests (1)' }));
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Omar Khaled approved.')).toBeInTheDocument();
    expect(nth(calls, 0)).toMatchObject({
      url: `/api/doctor/groups/${GROUP_ID}/members/${STUDENT_ID}/approve`,
      init: { method: 'POST' },
    });
  });

  it('asks before removing a student', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([200, { member: member({ status: 'removed' }) }]);
    vi.stubGlobal('fetch', fetchMock);
    renderGroup([member()]);

    await user.click(screen.getByRole('button', { name: 'Remove from group' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove Omar Khaled from the group?' });
    expect(dialog).toHaveAccessibleDescription(/cannot come back with the code/);
    expect(calls).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Remove from group' }));
    expect(await screen.findByText('Omar Khaled removed from the group.')).toBeInTheDocument();
    expect(nth(calls, 0).url).toBe(`/api/doctor/groups/${GROUP_ID}/members/${STUDENT_ID}/remove`);
  });

  it('suspends an account only with a reason', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([204]);
    vi.stubGlobal('fetch', fetchMock);
    renderGroup([member()]);

    await user.click(screen.getByRole('button', { name: 'Suspend account' }));
    const dialog = screen.getByRole('dialog', { name: 'Suspend Omar Khaled’s account?' });
    await user.click(within(dialog).getByRole('button', { name: 'Suspend account' }));
    expect(within(dialog).getByLabelText(/Reason/)).toHaveAccessibleDescription(
      /Give a reason of 3 to 300 characters/,
    );
    expect(calls).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/Reason/), 'Shared exam answers');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend account' }));

    expect(await screen.findByText('Omar Khaled’s account suspended.')).toBeInTheDocument();
    expect(nth(calls, 0)).toMatchObject({
      url: `/api/doctor/students/${STUDENT_ID}/suspend`,
      init: { method: 'POST', body: JSON.stringify({ reason: 'Shared exam answers' }) },
    });
  });

  it('lets only the suspending doctor lift a suspension', () => {
    const byMe = member({
      student: {
        ...member().student,
        suspension: { byMe: true, byName: 'Dr. Mona', reason: 'Cheating', at: '2026-09-30' },
      },
    });
    const byColleague = member({
      student: {
        ...member().student,
        id: 'other-student',
        name: 'Nour Ali',
        suspension: { byMe: false, byName: 'Dr. Karim', reason: null, at: '2026-09-30' },
      },
    });
    renderGroup([byMe, byColleague]);

    expect(screen.getByText('Suspended by you')).toBeInTheDocument();
    expect(screen.getByText('Reason: Cheating')).toBeInTheDocument();
    expect(screen.getByText('Suspended by Dr. Karim')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Lift suspension' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Suspend account' })).not.toBeInTheDocument();
  });

  it('mutes a student in the chat and shows it on the student', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([200, { member: member({ chatMuted: true }) }]);
    vi.stubGlobal('fetch', fetchMock);
    renderGroup([member()]);

    await user.click(screen.getByRole('button', { name: 'Mute in chat' }));

    expect(await screen.findByText('Omar Khaled muted in the chat.')).toBeInTheDocument();
    expect(nth(calls, 0)).toMatchObject({
      url: `/api/doctor/groups/${GROUP_ID}/members/${STUDENT_ID}/chat-mute`,
      init: { method: 'POST', body: JSON.stringify({ muted: true }) },
    });
  });

  it('offers to unmute a muted student', () => {
    renderGroup([member({ chatMuted: true })]);

    expect(screen.getByText('Muted in chat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens on the chat unless students are waiting, and keeps the tab in the address', async () => {
    const user = userEvent.setup();
    const { fetchMock } = queueResponses();
    vi.stubGlobal('fetch', fetchMock);
    renderGroup([member()], { unread: 3 }, '');

    expect(screen.getByRole('tab', { name: 'Chat (3)' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: 'Students' }));
    expect(screen.getByRole('tab', { name: 'Students' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Omar Khaled')).toBeInTheDocument();
  });

  it('opens on the students when some are waiting for approval', () => {
    renderGroup([member({ status: 'pending' })], { counts: { active: 0, pending: 1, out: 0 } }, '');

    expect(screen.getByRole('tab', { name: 'Students' })).toHaveAttribute('aria-selected', 'true');
  });

  it('lets the doctor choose how many messages each student sends a minute', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([200, { group: group({ chatRateLimit: 30 }) }]);
    vi.stubGlobal('fetch', fetchMock);
    renderGroup([member()]);

    const field = screen.getByLabelText(/Messages per student per minute/);
    expect(field).toHaveValue(60);
    expect(screen.getByRole('button', { name: 'Save limit' })).toBeDisabled();

    await user.clear(field);
    await user.type(field, '0');
    await user.click(screen.getByRole('button', { name: 'Save limit' }));
    expect(field).toHaveAccessibleDescription(/Enter a whole number from 1 to 120/);
    expect(calls).toHaveLength(0);

    await user.clear(field);
    await user.type(field, '30');
    await user.click(screen.getByRole('button', { name: 'Save limit' }));
    await vi.waitFor(() => {
      expect(nth(calls, 0)).toMatchObject({
        url: `/api/doctor/groups/${GROUP_ID}`,
        init: { method: 'PATCH', body: JSON.stringify({ chatRateLimit: 30 }) },
      });
    });
  });

  it('shows a QR code students can scan, and a large one for the projector', async () => {
    const user = userEvent.setup();
    renderGroup([member()]);

    expect(
      screen.getByRole('img', { name: 'QR code to join “Conversation 2”' }),
    ).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Show on screen' })[0] ?? never());

    const dialog = screen.getByRole('dialog', { name: 'Join “Conversation 2”' });
    expect(within(dialog).getByText('K7QM-9XRT')).toBeInTheDocument();
    expect(within(dialog).getByText(/\/join\/K7QM9XRT$/)).toBeInTheDocument();
  });

  it('is read-only while archived', () => {
    renderGroup([member()], { archived: true });

    expect(screen.getByText(/This group is archived and read-only/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore group' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove from group' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Student’s email/)).not.toBeInTheDocument();
  });
});

describe('a student’s groups', () => {
  const preview = {
    group: {
      name: 'Conversation 2',
      description: null,
      language: 'fr',
      photoUrl: null,
      doctorName: 'Dr. Mona',
      doctorAvatarUrl: null,
      requiresApproval: false,
    },
    membership: null,
  };

  it('checks the shape of a code before asking the server', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StudentGroupsCard student={studentUser().student ?? never()} />, {
      cache: [[STUDENT_GROUPS_KEY, []]],
    });

    await user.type(screen.getByLabelText(/Group code/), 'abc');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText(/Group code/)).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toHaveLength(0);
  });

  it('shows the group, then joins it and says the language was added', async () => {
    const user = userEvent.setup();
    const joined: StudentGroup = {
      id: GROUP_ID,
      name: 'Conversation 2',
      description: null,
      language: 'fr',
      photoUrl: null,
      doctorName: 'Dr. Mona',
      doctorAvatarUrl: null,
      status: 'active',
      joinedAt: '2026-09-30T10:00:00.000Z',
      unread: 0,
    };
    const { fetchMock, calls } = queueResponses(
      [200, preview],
      [201, { status: 'active', languageAdded: true, user: studentUser(['en', 'fr']) }],
      [200, { groups: [joined] }],
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StudentGroupsCard student={studentUser().student ?? never()} />, {
      cache: [[STUDENT_GROUPS_KEY, []]],
    });

    await user.type(screen.getByLabelText(/Group code/), 'k7qm-9xrt');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    const dialog = await screen.findByRole('dialog', { name: 'Join a group' });
    expect(await within(dialog).findByText('Dr. Mona')).toBeInTheDocument();
    expect(within(dialog).getByText(/French joins your languages/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Join' }));

    expect(
      await screen.findByText(
        'You joined “Conversation 2”, and French was added to your languages.',
      ),
    ).toBeInTheDocument();
    expect(nth(calls, 0)).toMatchObject({
      url: '/api/student/join/preview',
      init: { body: JSON.stringify({ code: 'K7QM9XRT' }) },
    });
    expect(nth(calls, 1).url).toBe('/api/student/join');
    expect(await screen.findByText('Conversation 2')).toBeInTheDocument();
  });

  it('says how many tries are left after a wrong code', async () => {
    const user = userEvent.setup();
    const { fetchMock } = queueResponses([
      404,
      apiError('INVALID_JOIN_CODE', { details: { attemptsLeft: 7 } }),
    ]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StudentGroupsCard student={studentUser().student ?? never()} />, {
      cache: [[STUDENT_GROUPS_KEY, []]],
    });

    await user.type(screen.getByLabelText(/Group code/), 'ZZZZ-ZZZZ');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No group has this code. Check it and try again. Attempts left: 7',
    );
  });

  it('continues a join started from a link before signing in', async () => {
    sessionStorage.setItem('acu.pendingJoinCode', 'K7QM9XRT');
    const { fetchMock, calls } = queueResponses([200, preview]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StudentGroupsCard student={studentUser().student ?? never()} />, {
      cache: [[STUDENT_GROUPS_KEY, []]],
    });

    expect(await screen.findByRole('dialog', { name: 'Join a group' })).toBeInTheDocument();
    expect(nth(calls, 0).url).toBe('/api/student/join/preview');
    expect(sessionStorage.getItem('acu.pendingJoinCode')).toBeNull();
  });
});

describe('the join link', () => {
  it('asks a visitor to sign in, and remembers the code for afterwards', async () => {
    renderWithProviders(<JoinPage />, {
      path: '/join/:code',
      route: '/join/k7qm-9xrt',
      session: null,
    });

    expect(screen.getByText('K7QM-9XRT')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Google/ })).toHaveAttribute(
      'href',
      `/api/auth/google/start?returnTo=${encodeURIComponent('/join/K7QM9XRT')}`,
    );
    await vi.waitFor(() => {
      expect(sessionStorage.getItem('acu.pendingJoinCode')).toBe('K7QM9XRT');
    });
  });

  it('sends an account without a role to set up first', () => {
    renderWithProviders(<JoinPage />, {
      path: '/join/:code',
      route: '/join/K7QM9XRT',
      session: sessionUser(),
    });

    expect(screen.getByRole('link', { name: 'Set up my account' })).toHaveAttribute(
      'href',
      '/welcome',
    );
  });

  it('tells a doctor that groups are for students', () => {
    renderWithProviders(<JoinPage />, {
      path: '/join/:code',
      route: '/join/K7QM9XRT',
      session: doctorUser,
    });

    expect(screen.getByText('Groups are for students to join.')).toBeInTheDocument();
  });

  it('rejects a link without a valid code', () => {
    renderWithProviders(<JoinPage />, {
      path: '/join/:code',
      route: '/join/nonsense',
      session: null,
    });

    expect(screen.getByText('This link does not contain a valid code.')).toBeInTheDocument();
  });
});

function never(): never {
  throw new Error('Expected a student');
}

describe('a group as its student sees it', () => {
  const view = {
    id: GROUP_ID,
    name: 'Conversation 2',
    description: 'Mondays 10:00',
    language: 'fr' as const,
    photoUrl: null,
    archived: false,
    doctor: { name: 'Dr. Mona', avatarUrl: null },
    isDoctor: false,
    chat: { open: true, muted: false, canPost: true, lastReadSeq: 0, rateLimit: 60 },
  };

  it('shows who teaches the group and opens its chat', async () => {
    const { fetchMock } = queueResponses([
      200,
      { messages: [], pinned: [], version: 0, hasOlder: false },
    ]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StudentGroupPage />, {
      route: `/app/groups/${GROUP_ID}`,
      path: '/app/groups/:groupId',
      session: studentUser(['fr']),
      cache: [
        [['group', GROUP_ID], view],
        [
          ['group', GROUP_ID, 'people'],
          [
            {
              id: 'doctor-1',
              name: 'Dr. Mona',
              avatarUrl: null,
              role: 'doctor',
              joinedAt: null,
              me: false,
            },
          ],
        ],
      ],
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Conversation 2' })).toBeInTheDocument();
    // In the header, and first among the group's members.
    expect(screen.getAllByText('Dr. Mona')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'My groups' })).toHaveAttribute(
      'href',
      '/app#my-groups',
    );
    expect(await screen.findByText('No messages yet. Start the conversation.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Members (1)' })).toBeInTheDocument();
  });

  it('shows the missing page to someone outside the group', async () => {
    const { fetchMock } = queueResponses([404, apiError('NOT_FOUND')]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StudentGroupPage />, {
      route: `/app/groups/${GROUP_ID}`,
      path: '/app/groups/:groupId',
      session: studentUser(['fr']),
    });

    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent(
      'Conversation 2',
    );
    expect(screen.queryByLabelText('Your message')).not.toBeInTheDocument();
  });
});
