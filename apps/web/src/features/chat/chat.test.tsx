import type { ChatMessage, ChatPage, GroupView } from '@acu/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { GroupChat } from './GroupChat';
import { chatReducer } from './use-chat';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';

function view(
  overrides: Partial<GroupView> = {},
  chat: Partial<GroupView['chat']> = {},
): GroupView {
  return {
    id: GROUP_ID,
    name: 'Conversation 2',
    description: null,
    language: 'fr',
    photoUrl: null,
    archived: false,
    doctor: { name: 'Dr. Mona', avatarUrl: null },
    isDoctor: false,
    ...overrides,
    chat: { open: true, muted: false, canPost: true, lastReadSeq: 0, ...chat },
  };
}

let nextSeq = 1;

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const seq = overrides.seq ?? nextSeq++;
  return {
    id: `message-${String(seq)}`,
    seq,
    version: seq,
    author: { id: 'doctor-1', name: 'Dr. Mona', avatarUrl: null, isDoctor: true },
    body: `Message ${String(seq)}`,
    attachment: null,
    replyTo: null,
    pinned: false,
    edited: false,
    deleted: false,
    mine: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function page(messages: ChatMessage[], extras: Partial<ChatPage> = {}): ChatPage {
  return { messages, pinned: [], version: messages.length, hasOlder: false, ...extras };
}

type Handler = (init: RequestInit | undefined) => [status: number, body?: unknown];

/** Answers each request by its method and path, and records every call. */
function serve(routes: Record<string, Handler>) {
  const calls: { key: string; init: RequestInit | undefined }[] = [];
  const fetchMock = (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push({ key, init });
    const handler = routes[key];
    const [status, body] = handler ? handler(init) : [204];
    return Promise.resolve(
      status === 204 ? new Response(null, { status }) : Response.json(body ?? {}, { status }),
    );
  };
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const CHAT = `/api/groups/${GROUP_ID}/chat`;

beforeEach(() => {
  nextSeq = 1;
});

describe('the chat’s state', () => {
  const empty = {
    byId: new Map<string, ChatMessage>(),
    version: 0,
    hasOlder: false,
    fromSeq: 0,
    status: 'loading' as const,
    error: null,
  };

  it('keeps the newest copy of a message whatever order changes arrive in', () => {
    const original = message({ seq: 1, version: 1 });
    const edited = { ...original, body: 'Edited', edited: true, version: 5 };
    const loaded = chatReducer(empty, {
      type: 'loaded',
      messages: [original],
      pinned: [],
      version: 1,
      hasOlder: false,
    });
    const changed = chatReducer(loaded, { type: 'changes', messages: [edited], version: 5 });
    const stale = chatReducer(changed, { type: 'changes', messages: [original], version: 1 });

    expect(stale.byId.get(original.id)?.body).toBe('Edited');
    expect(stale.version).toBe(5);
  });

  it('extends the timeline backwards when older messages are loaded', () => {
    const loaded = chatReducer(empty, {
      type: 'loaded',
      messages: [message({ seq: 51 }), message({ seq: 52 })],
      pinned: [message({ seq: 3, pinned: true })],
      version: 52,
      hasOlder: true,
    });
    expect(loaded.fromSeq).toBe(51);

    const older = chatReducer(loaded, {
      type: 'older',
      messages: [message({ seq: 1 }), message({ seq: 2 })],
      hasOlder: false,
    });
    expect(older.fromSeq).toBe(0);
    expect(older.hasOlder).toBe(false);
  });

  it('keeps showing a loaded chat when a later poll fails', () => {
    const loaded = chatReducer(empty, {
      type: 'loaded',
      messages: [],
      pinned: [],
      version: 0,
      hasOlder: false,
    });
    expect(chatReducer(loaded, { type: 'failed', error: new Error('offline') }).status).toBe(
      'ready',
    );
    expect(chatReducer(empty, { type: 'failed', error: new Error('offline') }).status).toBe(
      'failed',
    );
  });
});

describe('a group chat', () => {
  it('shows the messages with who wrote them, and marks them read', async () => {
    const calls = serve({
      [`GET ${CHAT}`]: () => [
        200,
        page([
          message({ body: 'Welcome to the group' }),
          message({
            author: { id: 'student-2', name: 'Nour Ali', avatarUrl: null, isDoctor: false },
            body: 'Thank you, see https://acu.edu.eg/timetable.',
          }),
        ]),
      ],
    });
    renderWithProviders(<GroupChat view={view()} />);

    expect(await screen.findByText('Welcome to the group')).toBeInTheDocument();
    expect(screen.getByText('Doctor')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://acu.edu.eg/timetable' })).toHaveAttribute(
      'rel',
      'noopener noreferrer nofollow',
    );
    expect(screen.getByText('Today')).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(calls.find((call) => call.key === `POST ${CHAT}/read`)?.init?.body).toBe(
        JSON.stringify({ seq: 2 }),
      );
    });
  });

  it('draws one line where the unread messages start', async () => {
    serve({
      [`GET ${CHAT}`]: () => [
        200,
        page([
          message(),
          message(),
          message({ mine: true }),
          message(),
          message({ mine: true }),
          message(),
        ]),
      ],
    });
    renderWithProviders(<GroupChat view={view({}, { lastReadSeq: 1 })} />);

    await screen.findByText('Message 6');
    expect(screen.getAllByText('New messages')).toHaveLength(1);
  });

  it('sends with Enter and shows the message at once', async () => {
    const user = userEvent.setup();
    const sent = message({ body: 'Hello everyone', mine: true, seq: 10 });
    const calls = serve({
      [`GET ${CHAT}`]: () => [200, page([])],
      [`POST ${CHAT}`]: () => [201, { message: sent }],
    });
    renderWithProviders(<GroupChat view={view()} />);

    expect(await screen.findByText('No messages yet. Start the conversation.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your message'), 'Hello everyone{Enter}');

    expect(await screen.findByText('Hello everyone')).toBeInTheDocument();
    expect(screen.getByLabelText('Your message')).toHaveValue('');
    const body = calls.find((call) => call.key === `POST ${CHAT}`)?.init?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('body')).toBe('Hello everyone');
  });

  it('starts a new line with Shift+Enter instead of sending', async () => {
    const user = userEvent.setup();
    const calls = serve({ [`GET ${CHAT}`]: () => [200, page([])] });
    renderWithProviders(<GroupChat view={view()} />);

    const box = await screen.findByLabelText('Your message');
    await user.type(box, 'First{Shift>}{Enter}{/Shift}Second');

    expect(box).toHaveValue('First\nSecond');
    expect(calls.some((call) => call.key === `POST ${CHAT}`)).toBe(false);
  });

  it('replies to a message with its quote', async () => {
    const user = userEvent.setup();
    const original = message({ body: 'Read chapter 2' });
    const calls = serve({
      [`GET ${CHAT}`]: () => [200, page([original])],
      [`POST ${CHAT}`]: () => [201, { message: message({ mine: true, body: 'Done' }) }],
    });
    renderWithProviders(<GroupChat view={view()} />);

    await user.click(await screen.findByRole('button', { name: 'Options for Dr. Mona’s message' }));
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    expect(screen.getByText('Replying to Dr. Mona')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Your message'), 'Done{Enter}');
    await screen.findByText('Done');
    const body = calls.find((call) => call.key === `POST ${CHAT}`)?.init?.body as FormData;
    expect(body.get('replyToId')).toBe(original.id);
    expect(screen.queryByText('Replying to Dr. Mona')).not.toBeInTheDocument();
  });

  it('refuses a file over 10 MB before uploading it', async () => {
    const user = userEvent.setup();
    serve({ [`GET ${CHAT}`]: () => [200, page([])] });
    const { container } = renderWithProviders(<GroupChat view={view()} />);
    await screen.findByLabelText('Your message');

    const big = new File(['x'], 'lecture.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) {
      throw new Error('The file input is missing');
    }
    await user.upload(input, big);

    expect(screen.getByRole('alert')).toHaveTextContent('The file is larger than 10 MB.');
    expect(screen.queryByText('lecture.pdf')).not.toBeInTheDocument();
  });

  it('lets students only read while the chat is closed to them', async () => {
    serve({ [`GET ${CHAT}`]: () => [200, page([])] });
    renderWithProviders(<GroupChat view={view({}, { open: false, canPost: false })} />);

    expect(await screen.findByText('No announcements yet.')).toBeInTheDocument();
    expect(screen.getByText('Announcements only')).toBeInTheDocument();
    expect(
      screen.getByText('The chat is for announcements now: only the doctor writes.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Your message')).not.toBeInTheDocument();
  });

  it('tells a muted student why they cannot write', async () => {
    serve({ [`GET ${CHAT}`]: () => [200, page([])] });
    renderWithProviders(<GroupChat view={view({}, { muted: true, canPost: false })} />);

    expect(
      await screen.findByText('The doctor muted you in this chat: you can read only.'),
    ).toBeInTheDocument();
  });

  it('does not offer a student to pin or delete someone else’s message', async () => {
    const user = userEvent.setup();
    serve({ [`GET ${CHAT}`]: () => [200, page([message()])] });
    renderWithProviders(<GroupChat view={view()} />);

    await user.click(await screen.findByRole('button', { name: 'Options for Dr. Mona’s message' }));
    expect(screen.queryByRole('button', { name: 'Pin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('lets the doctor pin and delete any message, after asking', async () => {
    const user = userEvent.setup();
    const student = { id: 'student-2', name: 'Nour Ali', avatarUrl: null, isDoctor: false };
    const original = message({ author: student, body: 'Off-topic link' });
    const calls = serve({
      [`GET ${CHAT}`]: () => [200, page([original])],
      [`POST ${CHAT}/${original.id}/pin`]: () => [
        200,
        { message: { ...original, pinned: true, version: 10 } },
      ],
      [`DELETE ${CHAT}/${original.id}`]: () => [
        200,
        { message: { ...original, body: null, deleted: true, pinned: false, version: 11 } },
      ],
    });
    renderWithProviders(<GroupChat view={view({ isDoctor: true })} />);

    await user.click(await screen.findByRole('button', { name: 'Options for Nour Ali’s message' }));
    await user.click(screen.getByRole('button', { name: 'Pin' }));
    expect(await screen.findByText('Pinned messages (1)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Options for Nour Ali’s message' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete the message?' });
    expect(calls.some((call) => call.key.startsWith('DELETE'))).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('This message was deleted.')).toBeInTheDocument();
    expect(screen.queryByText('Pinned messages (1)')).not.toBeInTheDocument();
  });

  it('lets the doctor close the chat to students', async () => {
    const user = userEvent.setup();
    const calls = serve({
      [`GET ${CHAT}`]: () => [200, page([])],
      [`PATCH /api/doctor/groups/${GROUP_ID}`]: () => [200, { group: {} }],
    });
    renderWithProviders(<GroupChat view={view({ isDoctor: true })} />);

    await user.click(await screen.findByRole('button', { name: 'Stop students writing' }));

    await vi.waitFor(() => {
      expect(calls.find((call) => call.key.startsWith('PATCH'))?.init?.body).toBe(
        JSON.stringify({ chatOpen: false }),
      );
    });
  });
});
