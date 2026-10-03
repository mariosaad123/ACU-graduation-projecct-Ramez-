import type { ChatMessage, Poll } from '@acu/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nth, queueResponses, renderWithProviders } from '../../test/render';
import { mentionQuery, plainBody, renderBody, toTokens } from './mentions';
import { PinnedBar } from './PinnedBar';
import { PollView } from './PollView';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const OMAR = '33333333-3333-4333-8333-333333333333';
const NOUR = '44444444-4444-4444-8444-444444444444';

afterEach(() => {
  vi.unstubAllGlobals();
});

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    seq: 1,
    version: 1,
    author: { id: 'doctor-1', name: 'Dr. Mona', avatarUrl: null, isDoctor: true, role: 'owner' },
    body: 'Read chapter 3',
    mentions: [],
    mentionsAll: false,
    mentionsMe: false,
    attachment: null,
    poll: null,
    reactions: [],
    replyTo: null,
    pinned: true,
    edited: false,
    deleted: false,
    mine: false,
    createdAt: '2026-10-03T08:00:00.000Z',
    ...overrides,
  };
}

function poll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: 'poll-1',
    question: 'When is the quiz?',
    multiple: false,
    anonymous: false,
    closesAt: null,
    closed: false,
    options: [
      { id: 'monday', text: 'Monday', votes: 1, voters: [{ id: NOUR, name: 'Nour Ali' }] },
      { id: 'thursday', text: 'Thursday', votes: 0, voters: [] },
    ],
    voters: 1,
    myVotes: [],
    canClose: false,
    ...overrides,
  };
}

describe('mentions', () => {
  it('turns the names picked from the list into tokens, longest name first', () => {
    const picked = new Map([
      ['Omar', NOUR],
      ['Omar Khaled', OMAR],
    ]);

    expect(toTokens('@Omar Khaled and @Omar, hello @all.', picked, ['all', 'الكل'])).toBe(
      `@[${OMAR}] and @[${NOUR}], hello @[all].`,
    );
    // An address is not a mention of everyone.
    expect(toTokens('write to me@all.example', picked, ['all'])).toBe('write to me@all.example');
  });

  it('reads a stored message back as plain text', () => {
    expect(
      plainBody(`@[${OMAR}] and @[all]`, [{ id: OMAR, name: 'Omar Khaled' }], 'everyone'),
    ).toBe('@Omar Khaled and @everyone');
  });

  it('links each person named in a message to their profile', () => {
    renderWithProviders(
      <p>{renderBody(`Well done @[${OMAR}]`, [{ id: OMAR, name: 'Omar Khaled' }], 'all')}</p>,
    );

    expect(screen.getByRole('link', { name: '@Omar Khaled' })).toHaveAttribute(
      'href',
      `/app/people/${OMAR}`,
    );
  });

  it('finds the name being typed before the cursor', () => {
    expect(mentionQuery('hello @Om', 9)).toEqual({ start: 6, query: 'Om' });
    expect(mentionQuery('mail me@acu', 11)).toBeNull();
    expect(mentionQuery('@first line\nsecond', 18)).toBeNull();
  });
});

describe('a poll in the chat', () => {
  it('shows the results and sends a vote', async () => {
    const user = userEvent.setup();
    const voted = message({ poll: poll({ myVotes: ['thursday'], voters: 2 }) });
    const { fetchMock, calls } = queueResponses([200, { message: voted }]);
    vi.stubGlobal('fetch', fetchMock);
    const onChanged = vi.fn();
    renderWithProviders(
      <PollView groupId={GROUP_ID} poll={poll()} readOnly={false} onChanged={onChanged} />,
    );

    expect(screen.getByText('One choice · With names')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Monday/ })).toHaveTextContent('Votes: 1 · 100%');
    await user.click(screen.getByRole('button', { name: /Thursday/ }));

    await vi.waitFor(() => {
      expect(onChanged).toHaveBeenCalledWith(voted);
    });
    expect(nth(calls, 0)).toMatchObject({
      url: `/api/groups/${GROUP_ID}/polls/poll-1/vote`,
      init: { method: 'POST', body: JSON.stringify({ optionIds: ['thursday'] }) },
    });
  });

  it('names who voted only when asked, and never offers a student to close it', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PollView groupId={GROUP_ID} poll={poll()} readOnly={false} onChanged={vi.fn()} />,
    );

    expect(screen.queryByText('Nour Ali')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Who voted?' }));
    expect(screen.getByText('Nour Ali')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close the poll' })).not.toBeInTheDocument();
  });

  it('takes no more votes once closed', () => {
    renderWithProviders(
      <PollView
        groupId={GROUP_ID}
        poll={poll({ closed: true, canClose: true })}
        readOnly={false}
        onChanged={vi.fn()}
      />,
    );

    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Monday/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Close the poll' })).not.toBeInTheDocument();
  });
});

describe('the pinned messages bar', () => {
  const pins = [
    message({ id: 'pin-new', body: 'Midterm on Sunday' }),
    message({ id: 'pin-old', body: null, poll: poll() }),
  ];

  it('goes to the pin shown and moves on to the next one', async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    renderWithProviders(
      <PinnedBar pinned={pins} canUnpin={false} onJump={onJump} onUnpin={vi.fn()} />,
    );

    expect(screen.getByText('Midterm on Sunday')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to pinned message 1 of 2' }));

    expect(onJump).toHaveBeenCalledWith('pin-new');
    // A pinned poll is shown by its question.
    expect(screen.getByText('When is the quiz?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to pinned message 2 of 2' }));
    expect(onJump).toHaveBeenLastCalledWith('pin-old');
    expect(screen.getByRole('button', { name: 'Go to pinned message 1 of 2' })).toBeInTheDocument();
  });

  it('lists every pin, and lets only those who may unpin them', async () => {
    const user = userEvent.setup();
    const onUnpin = vi.fn();
    const { unmount } = renderWithProviders(
      <PinnedBar pinned={pins} canUnpin onJump={vi.fn()} onUnpin={onUnpin} />,
    );

    await user.click(screen.getByRole('button', { name: 'Show all pinned messages (2)' }));
    await user.click(nth(screen.getAllByRole('button', { name: 'Unpin' }), 1));
    expect(onUnpin).toHaveBeenCalledWith(pins[1]);
    unmount();

    renderWithProviders(
      <PinnedBar pinned={pins} canUnpin={false} onJump={vi.fn()} onUnpin={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'Show all pinned messages (2)' }));
    expect(screen.queryByRole('button', { name: 'Unpin' })).not.toBeInTheDocument();
  });
});
