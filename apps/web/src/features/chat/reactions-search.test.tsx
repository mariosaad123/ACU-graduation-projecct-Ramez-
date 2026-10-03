import type { ChatMessage } from '@acu/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, nth, queueResponses, renderWithProviders } from '../../test/render';
import { ChatSearch } from './ChatSearch';
import { ReactionBar, ReactionPicker } from './Reactions';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  vi.unstubAllGlobals();
});

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    seq: 1,
    version: 1,
    author: { id: 'doctor-1', name: 'Dr. Mona', avatarUrl: null, isDoctor: true, role: 'owner' },
    body: 'The quiz covers chapter 3',
    mentions: [],
    mentionsAll: false,
    mentionsMe: false,
    attachment: null,
    poll: null,
    reactions: [],
    replyTo: null,
    pinned: false,
    edited: false,
    deleted: false,
    mine: false,
    createdAt: '2026-10-03T08:00:00.000Z',
    ...overrides,
  };
}

describe('reactions under a message', () => {
  it('adds the reader to a reaction, and takes theirs back on a second press', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const reacted = message({ reactions: [{ emoji: '👍', count: 3, mine: true }] });
    const { fetchMock, calls } = queueResponses(
      [200, { message: reacted }],
      [200, { message: message({ reactions: [{ emoji: '👍', count: 2, mine: false }] }) }],
    );
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = renderWithProviders(
      <ReactionBar
        groupId={GROUP_ID}
        message={message({ reactions: [{ emoji: '👍', count: 2, mine: false }] })}
        readOnly={false}
        onChanged={onChanged}
      />,
    );

    await user.click(screen.getByRole('button', { name: '👍, 2' }));
    await vi.waitFor(() => {
      expect(onChanged).toHaveBeenCalledWith(reacted);
    });
    expect(nth(calls, 0)).toMatchObject({
      url: `/api/groups/${GROUP_ID}/chat/message-1/reaction`,
      init: { method: 'PUT', body: JSON.stringify({ emoji: '👍' }) },
    });

    rerender(
      <ReactionBar groupId={GROUP_ID} message={reacted} readOnly={false} onChanged={onChanged} />,
    );
    const mine = screen.getByRole('button', { name: '👍, 3' });
    expect(mine).toHaveAttribute('aria-pressed', 'true');
    await user.click(mine);
    await vi.waitFor(() => {
      expect(nth(calls, 1).init?.body).toBe(JSON.stringify({ emoji: null }));
    });
  });

  it('names the answers to a message from the staff, and lists who reacted', async () => {
    const user = userEvent.setup();
    const { fetchMock } = queueResponses([
      200,
      {
        reactions: [
          { emoji: '✅', people: [{ id: 'omar', name: 'Omar Khaled', avatarUrl: null }] },
          { emoji: '❓', people: [{ id: 'nour', name: 'Nour Ali', avatarUrl: null }] },
        ],
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <ReactionBar
        groupId={GROUP_ID}
        message={message({
          reactions: [
            { emoji: '✅', count: 1, mine: false },
            { emoji: '❓', count: 1, mine: false },
          ],
        })}
        readOnly={false}
        onChanged={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Got it, 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Needs explaining, 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Who reacted? (2)' }));
    const dialog = screen.getByRole('dialog', { name: 'Reactions' });
    expect(await within(dialog).findByRole('link', { name: /Nour Ali/ })).toHaveAttribute(
      'href',
      '/app/people/nour',
    );
  });

  it('says so when a reaction cannot be saved, and leaves the message as it was', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const { fetchMock } = queueResponses([409, apiError('GROUP_ARCHIVED')]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <ReactionBar
        groupId={GROUP_ID}
        message={message({ reactions: [{ emoji: '❤️', count: 1, mine: false }] })}
        readOnly={false}
        onChanged={onChanged}
      />,
    );

    await user.click(screen.getByRole('button', { name: '❤️, 1' }));

    expect(await screen.findByText(/archived/i)).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('the reaction picker', () => {
  it('offers a student the two answers to the staff, then the usual emoji', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([200, { message: message() }]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <ReactionPicker groupId={GROUP_ID} message={message()} onChanged={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'React to Dr. Mona’s message' }));
    expect(screen.getByRole('button', { name: '❤️' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All emoji' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Needs explaining/ }));

    await vi.waitFor(() => {
      expect(nth(calls, 0).init?.body).toBe(JSON.stringify({ emoji: '❓' }));
    });
  });

  it('keeps those answers off a classmate’s message', async () => {
    const user = userEvent.setup();
    const classmate = message({
      author: { id: 'nour', name: 'Nour Ali', avatarUrl: null, isDoctor: false, role: 'student' },
    });
    renderWithProviders(
      <ReactionPicker groupId={GROUP_ID} message={classmate} onChanged={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'React to Nour Ali’s message' }));

    expect(screen.getByRole('button', { name: '👍' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Got it/ })).not.toBeInTheDocument();
  });
});

describe('searching the chat', () => {
  it('waits for two characters, then lists matches and opens the chosen one', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const found = message({ body: 'The quiz covers chapter 3' });
    const { fetchMock, calls } = queueResponses([200, { messages: [found], hasMore: false }]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ChatSearch groupId={GROUP_ID} onOpen={onOpen} onClose={vi.fn()} />);

    expect(screen.getByText(/Type a couple of words/)).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'q');
    expect(calls).toHaveLength(0);

    // The rest arrives at once, as when pasted: one request for the whole word.
    await user.paste('uiz');
    const result = await screen.findByRole('button', { name: /The quiz covers chapter 3/ });
    expect(within(result).getByText('quiz').tagName).toBe('MARK');
    expect(nth(calls, calls.length - 1).url).toBe(
      `/api/groups/${GROUP_ID}/chat/search?filter=all&q=quiz`,
    );

    await user.click(result);
    expect(onOpen).toHaveBeenCalledWith(found);
  });

  it('lists everything in a filter without any words, and says when nothing matches', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([200, { messages: [], hasMore: false }]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ChatSearch groupId={GROUP_ID} onOpen={vi.fn()} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Pinned' }));

    expect(await screen.findByText(/No matching messages/)).toBeInTheDocument();
    expect(nth(calls, 0).url).toBe(`/api/groups/${GROUP_ID}/chat/search?filter=pinned`);
  });

  it('offers another try when the search fails, and closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { fetchMock, calls } = queueResponses(
      [500, apiError('INTERNAL_ERROR')],
      [200, { messages: [], hasMore: false }],
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ChatSearch groupId={GROUP_ID} onOpen={vi.fn()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'With files' }));
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/No matching messages/)).toBeInTheDocument();
    expect(calls).toHaveLength(2);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
