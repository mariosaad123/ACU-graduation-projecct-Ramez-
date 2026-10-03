import {
  CAPABILITIES,
  type Assignment,
  type AssignmentDetail,
  type GroupView,
  type SubmissionRow,
} from '@acu/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, nth, queueResponses, renderWithProviders } from '../../test/render';
import { assignmentsKey } from './api';
import { AssignmentsTab } from './AssignmentsTab';
import { NudgeDialog } from './NudgeDialog';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const ASSIGNMENT_ID = '22222222-2222-4222-8222-222222222222';
const OMAR = '33333333-3333-4333-8333-333333333333';
const NOUR = '44444444-4444-4444-8444-444444444444';

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

function assignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: ASSIGNMENT_ID,
    title: 'Essay 1',
    instructions: 'Write 150 words about your city.',
    kind: 'assignment',
    maxScore: 20,
    dueAt: null,
    allowLate: true,
    closed: false,
    accepting: true,
    attachments: [],
    author: { id: 'doctor-1', name: 'Dr. Mona' },
    createdAt: '2026-10-03T08:00:00.000Z',
    edited: false,
    columnId: 'column-1',
    mine: null,
    progress: null,
    ...overrides,
  };
}

const forStudent = (mine: Partial<NonNullable<Assignment['mine']>> = {}) =>
  assignment({
    mine: { state: 'missing', submission: null, grade: null, canSubmit: true, ...mine },
  });

const forStaff = (progress: Partial<NonNullable<Assignment['progress']>> = {}) =>
  assignment({
    progress: { students: 2, submitted: 1, graded: 0, released: false, ...progress },
  });

function row(overrides: Partial<SubmissionRow> = {}): SubmissionRow {
  return {
    student: { id: OMAR, name: 'Omar Khaled', avatarUrl: null, universityId: '2023-0417' },
    state: 'submitted',
    submission: {
      body: 'Meine Stadt ist Kairo.',
      files: [],
      submittedAt: '2026-10-03T09:00:00.000Z',
      updatedAt: '2026-10-03T09:00:00.000Z',
      late: false,
    },
    grade: null,
    ...overrides,
  };
}

function formData(call: { init: RequestInit | undefined }): unknown {
  const body = call.init?.body;
  const data = body instanceof FormData ? body.get('data') : null;
  return typeof data === 'string' ? JSON.parse(data) : undefined;
}

describe('assignments, as a student sees them', () => {
  function renderFor(list: Assignment[]) {
    return renderWithProviders(<AssignmentsTab view={view('student')} />, {
      route: `/app/groups/${GROUP_ID}?tab=assignments`,
      path: '/app/groups/:groupId',
      cache: [[assignmentsKey(GROUP_ID), list]],
    });
  }

  it('asks for an answer or a file before anything is sent', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses();
    vi.stubGlobal('fetch', fetchMock);
    renderFor([forStudent()]);

    expect(screen.getByText('Not handed in')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hand in' }));
    const dialog = screen.getByRole('dialog', { name: 'Hand in' });
    await user.click(within(dialog).getByRole('button', { name: 'Hand in' }));

    expect(within(dialog).getByLabelText(/Your answer/)).toHaveAccessibleDescription(
      /Write an answer or attach at least one file/,
    );
    expect(calls).toHaveLength(0);
  });

  it('hands in the answer, and keeps it in place when sending fails', async () => {
    const user = userEvent.setup();
    const handedIn = forStudent({
      state: 'submitted',
      submission: row().submission,
    });
    const { fetchMock, calls } = queueResponses(
      [409, apiError('ASSIGNMENT_CLOSED')],
      [200, { assignment: handedIn }],
      [200, { assignments: [handedIn] }],
    );
    vi.stubGlobal('fetch', fetchMock);
    renderFor([forStudent()]);

    await user.click(screen.getByRole('button', { name: 'Hand in' }));
    const dialog = screen.getByRole('dialog', { name: 'Hand in' });
    await user.type(within(dialog).getByLabelText(/Your answer/), 'Meine Stadt ist Kairo.');
    await user.click(within(dialog).getByRole('button', { name: 'Hand in' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This assignment no longer takes work.',
    );
    expect(within(dialog).getByLabelText(/Your answer/)).toHaveValue('Meine Stadt ist Kairo.');

    await user.click(within(dialog).getByRole('button', { name: 'Hand in' }));
    expect(await screen.findByText(/^Handed in\. You can change it/)).toBeInTheDocument();
    expect(nth(calls, 1)).toMatchObject({
      url: `/api/groups/${GROUP_ID}/assignments/${ASSIGNMENT_ID}/submission`,
      init: { method: 'PUT' },
    });
    expect(formData(nth(calls, 1))).toEqual({ body: 'Meine Stadt ist Kairo.', keepFileIds: [] });
  });

  it('shows the grade and the doctor’s note once released, and no way to change the work', () => {
    renderFor([
      forStudent({
        state: 'graded',
        submission: row().submission,
        grade: { status: 'scored', score: 17.5, note: 'Good structure' },
        canSubmit: false,
      }),
    ]);

    expect(screen.getByText('Graded')).toBeInTheDocument();
    expect(screen.getByText('17.5 / 20')).toBeInTheDocument();
    expect(screen.getByText('Good structure')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change my work' })).not.toBeInTheDocument();
  });

  it('explains a closed assignment that was never handed in', () => {
    renderFor([
      assignment({
        closed: true,
        accepting: false,
        mine: { state: 'missing', submission: null, grade: null, canSubmit: false },
      }),
    ]);

    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText(/closed before you handed in/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hand in' })).not.toBeInTheDocument();
  });
});

describe('assignments, as the staff see them', () => {
  function renderFor(list: Assignment[], route = `/app/groups/${GROUP_ID}?tab=assignments`) {
    return renderWithProviders(<AssignmentsTab view={view('owner')} />, {
      route,
      path: '/app/groups/:groupId',
      cache: [[assignmentsKey(GROUP_ID), list]],
    });
  }

  it('checks a new assignment before sending it', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses(
      [201, { assignment: forStaff() }],
      [200, { assignments: [forStaff()] }],
    );
    vi.stubGlobal('fetch', fetchMock);
    renderFor([]);

    expect(screen.getByText(/No assignments yet\. Create the first one/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New assignment' }));
    const dialog = screen.getByRole('dialog', { name: 'New assignment' });
    await user.clear(within(dialog).getByLabelText(/Maximum score/));
    await user.type(within(dialog).getByLabelText(/Maximum score/), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Post the assignment' }));

    expect(within(dialog).getByLabelText(/^Title/)).toHaveAccessibleDescription(
      /Give the assignment a title/,
    );
    expect(within(dialog).getByLabelText(/Maximum score/)).toHaveAccessibleDescription(
      /Enter a number above zero/,
    );
    expect(calls).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/^Title/), 'Essay 1');
    await user.clear(within(dialog).getByLabelText(/Maximum score/));
    await user.type(within(dialog).getByLabelText(/Maximum score/), '20');
    await user.click(within(dialog).getByRole('button', { name: 'Post the assignment' }));

    expect(await screen.findByText(/^Assignment posted/)).toBeInTheDocument();
    expect(formData(nth(calls, 0))).toEqual({
      title: 'Essay 1',
      instructions: '',
      kind: 'assignment',
      maxScore: 20,
      dueAt: null,
      allowLate: true,
    });
  });

  it('shows the progress and releases the grades', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses(
      [200, { assignment: forStaff({ released: true }) }],
      [200, { assignments: [forStaff({ released: true })] }],
    );
    vi.stubGlobal('fetch', fetchMock);
    renderFor([forStaff({ graded: 1 })]);

    expect(screen.getByText('Hidden from students')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show grades to students' }));

    expect(await screen.findByText(/^Grades are visible/)).toBeInTheDocument();
    expect(formData(nth(calls, 0))).toEqual({ released: true });
  });

  it('asks before deleting, and says what goes with the assignment', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses();
    vi.stubGlobal('fetch', fetchMock);
    renderFor([forStaff()]);

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = screen.getByRole('dialog', { name: 'Delete “Essay 1”?' });
    expect(dialog).toHaveAccessibleDescription(/everything handed in \(1\)/);
    expect(calls).toHaveLength(0);
  });

  it('opens each student’s work by name and grades it, refusing an impossible score', async () => {
    const user = userEvent.setup();
    const detail: AssignmentDetail = {
      assignment: forStaff(),
      submissions: [
        row({
          student: { id: NOUR, name: 'Nour Ali', avatarUrl: null, universityId: null },
          state: 'missing',
          submission: null,
        }),
        row(),
      ],
    };
    const graded = row({
      state: 'graded',
      grade: { status: 'scored', score: 17.5, note: 'Good structure' },
    });
    const { fetchMock, calls } = queueResponses(
      [200, { submission: graded }],
      [200, { assignments: [forStaff({ graded: 1 })] }],
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<AssignmentsTab view={view('owner')} />, {
      route: `/app/groups/${GROUP_ID}?tab=assignments&review=${ASSIGNMENT_ID}`,
      path: '/app/groups/:groupId',
      cache: [
        [assignmentsKey(GROUP_ID), [forStaff()]],
        [[...assignmentsKey(GROUP_ID), ASSIGNMENT_ID], detail],
      ],
    });

    // The work waiting to be graded comes up first, whoever is first in the list.
    expect(screen.getByRole('link', { name: 'Omar Khaled' })).toBeInTheDocument();
    expect(screen.getByText('Meine Stadt ist Kairo.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Remind those who have not handed in \(1\)/ }),
    ).toBeInTheDocument();

    const score = screen.getByLabelText(/Score out of 20/);
    await user.type(score, '21');
    await user.click(screen.getByRole('button', { name: 'Save and next' }));
    expect(score).toHaveAccessibleDescription(/Enter a number from 0 to 20/);
    expect(calls).toHaveLength(0);

    await user.clear(score);
    await user.type(score, '17.5');
    await user.type(screen.getByLabelText(/Note for the student/), 'Good structure');
    await user.click(screen.getByRole('button', { name: 'Save and next' }));

    expect(await screen.findByText('Omar Khaled’s grade saved.')).toBeInTheDocument();
    expect(nth(calls, 0)).toMatchObject({
      url: `/api/groups/${GROUP_ID}/assignments/${ASSIGNMENT_ID}/submissions/${OMAR}/grade`,
      init: {
        method: 'PUT',
        body: JSON.stringify({ status: 'scored', score: 17.5, note: 'Good structure' }),
      },
    });
  });
});

describe('reminders', () => {
  it('shows who will be reminded, and says how many were skipped', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { fetchMock, calls } = queueResponses([200, { sent: 1, skipped: 1 }]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <NudgeDialog
        groupId={GROUP_ID}
        students={[
          { id: OMAR, name: 'Omar Khaled' },
          { id: NOUR, name: 'Nour Ali' },
        ]}
        reason="assignment"
        targetId={ASSIGNMENT_ID}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Send a reminder to 2' });
    expect(within(dialog).getByText(/Omar Khaled.*Nour Ali/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Send the reminder' }));

    expect(await screen.findByText('Reminder sent to 1.')).toBeInTheDocument();
    expect(screen.getByText(/1 were skipped/)).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
    expect(nth(calls, 0)).toMatchObject({
      url: `/api/groups/${GROUP_ID}/nudges`,
      init: {
        method: 'POST',
        body: JSON.stringify({
          studentIds: [OMAR, NOUR],
          reason: 'assignment',
          targetId: ASSIGNMENT_ID,
        }),
      },
    });
  });
});
