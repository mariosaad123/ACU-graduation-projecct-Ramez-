import type { LearningLanguage, SessionUser, StudentGroup } from '@acu/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SESSION_QUERY_KEY } from '../auth/session';
import { STUDENT_GROUPS_KEY } from '../groups/api';
import { apiError, nth, queueResponses, renderWithProviders, sessionUser } from '../../test/render';
import { ActiveLanguageSwitch } from './ActiveLanguageSwitch';
import { LanguagesCard } from './LanguagesCard';

type Student = NonNullable<SessionUser['student']>;

function studentWith(activeLanguage: LearningLanguage, languages: LearningLanguage[]): Student {
  return { activeLanguage, languages, goal: 'study' };
}

function account(student: Student) {
  return { user: sessionUser({ role: 'student', student }) };
}

/** Renders like the app: the component follows the cached session, as the header does. */
function renderCard(student: Student, groups: StudentGroup[] = []) {
  const view = renderWithProviders(<LanguagesCard student={student} />, {
    route: '/app',
    session: sessionUser({ role: 'student', student }),
    cache: [[STUDENT_GROUPS_KEY, groups]],
  });
  const cachedStudent = () =>
    view.queryClient.getQueryData<SessionUser>(SESSION_QUERY_KEY)?.student ?? null;
  return { ...view, cachedStudent };
}

describe('LanguagesCard', () => {
  it('lists the languages and marks the one being studied', () => {
    renderCard(studentWith('fr', ['en', 'fr']));

    const rows = within(screen.getByRole('region', { name: 'Your languages' })).getAllByRole(
      'listitem',
    );
    expect(rows).toHaveLength(2);
    expect(within(nth(rows, 1)).getByText('Studying now')).toBeInTheDocument();
    expect(
      within(nth(rows, 0)).getByRole('button', { name: 'Study English now' }),
    ).toBeInTheDocument();
  });

  it('switches the active language and updates the account', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([200, account(studentWith('en', ['en', 'fr']))]);
    vi.stubGlobal('fetch', fetchMock);
    const { cachedStudent } = renderCard(studentWith('fr', ['en', 'fr']));

    await user.click(screen.getByRole('button', { name: 'Study English now' }));

    expect(await screen.findByText('Your current language: English')).toBeInTheDocument();
    expect(nth(calls, 0)).toMatchObject({
      url: '/api/student/active-language',
      init: { method: 'PUT', body: JSON.stringify({ language: 'en' }) },
    });
    expect(cachedStudent()?.activeLanguage).toBe('en');
  });

  it('keeps a language one of the student’s groups is taught in', () => {
    renderCard(studentWith('en', ['en', 'fr']), [
      {
        id: '00000000-0000-4000-8000-000000000009',
        name: 'Conversation 2',
        description: null,
        language: 'fr',
        doctorName: 'Dr. Mona',
        status: 'active',
        joinedAt: '2026-09-30T10:00:00.000Z',
      },
    ]);

    expect(screen.queryByRole('button', { name: 'Remove French' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove English' })).toBeInTheDocument();
    expect(screen.getByText('Used by one of your groups')).toBeInTheDocument();
  });

  it('cannot remove the only language', () => {
    renderCard(studentWith('fr', ['fr']));

    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });

  it('asks before removing, and says which language takes over', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([200, account(studentWith('de', ['de', 'ja']))]);
    vi.stubGlobal('fetch', fetchMock);
    const { cachedStudent } = renderCard(studentWith('fr', ['de', 'fr', 'ja']));

    await user.click(screen.getByRole('button', { name: 'Remove French' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove French from your languages?' });
    expect(dialog).toHaveAccessibleDescription(/German becomes your current one/);
    expect(calls).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    expect(await screen.findByText('French removed from your languages.')).toBeInTheDocument();
    expect(nth(calls, 0)).toMatchObject({
      url: '/api/student/languages/fr',
      init: { method: 'DELETE' },
    });
    expect(cachedStudent()).toMatchObject({ activeLanguage: 'de', languages: ['de', 'ja'] });
  });

  it('keeps the dialog open with the reason when a removal is refused', async () => {
    const user = userEvent.setup();
    const { fetchMock } = queueResponses([409, apiError('LAST_LANGUAGE')]);
    vi.stubGlobal('fetch', fetchMock);
    renderCard(studentWith('fr', ['de', 'fr']));

    await user.click(screen.getByRole('button', { name: 'Remove German' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove German from your languages?' });
    expect(dialog).toHaveAccessibleDescription(/You can add it again/);
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Your only language cannot be removed.',
    );
  });

  it('adds a language the student does not have yet', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([201, account(studentWith('zh', ['en', 'zh']))]);
    vi.stubGlobal('fetch', fetchMock);
    const { cachedStudent } = renderCard(studentWith('en', ['en']));

    await user.click(screen.getByRole('button', { name: 'Add a language' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a language' });
    expect(within(dialog).getByRole('radio', { name: /English.*added/ })).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'Add it and start' }));
    expect(within(dialog).getByRole('group')).toHaveAccessibleDescription(
      'Choose a language to add.',
    );
    expect(calls).toHaveLength(0);

    await user.click(within(dialog).getByRole('radio', { name: /中文/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Add it and start' }));

    expect(
      await screen.findByText('Chinese added. It is your current language now.'),
    ).toBeInTheDocument();
    expect(nth(calls, 0)).toMatchObject({
      url: '/api/student/languages',
      init: { method: 'POST', body: JSON.stringify({ language: 'zh' }) },
    });
    expect(cachedStudent()).toMatchObject({ activeLanguage: 'zh', languages: ['en', 'zh'] });
  });

  it('stops offering to add languages once all six are there', () => {
    renderCard(studentWith('en', ['ar', 'en', 'fr', 'de', 'zh', 'ja']));

    expect(screen.queryByRole('button', { name: 'Add a language' })).not.toBeInTheDocument();
    expect(
      screen.getByText('You have added every language the platform offers.'),
    ).toBeInTheDocument();
  });

  it('brings the card into view when opened from the header link', async () => {
    // jsdom does not lay pages out, so it has no scrollIntoView of its own.
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      const student = studentWith('en', ['en']);
      renderWithProviders(<LanguagesCard student={student} />, {
        route: '/app#languages',
        session: sessionUser({ role: 'student', student }),
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Your languages' })).toHaveFocus();
      });
      expect(scrollIntoView).toHaveBeenCalled();
    } finally {
      if (original) {
        Object.defineProperty(Element.prototype, 'scrollIntoView', original);
      } else {
        Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
      }
    }
  });
});

describe('ActiveLanguageSwitch', () => {
  it('lists the student’s languages with the current one marked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ActiveLanguageSwitch student={studentWith('ja', ['en', 'ja'])} />);

    const trigger = screen.getByRole('button', { name: 'Change language, current: Japanese' });
    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /日本語/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /English/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Manage your languages' })).toHaveAttribute(
      'href',
      '/app#languages',
    );
  });

  it('switches language, closes, and returns focus to the button', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([200, account(studentWith('en', ['en', 'ja']))]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ActiveLanguageSwitch student={studentWith('ja', ['en', 'ja'])} />, {
      session: sessionUser({ role: 'student', student: studentWith('ja', ['en', 'ja']) }),
    });

    const trigger = screen.getByRole('button', { name: /Change language/ });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /English/ }));

    expect(await screen.findByText('Your current language: English')).toBeInTheDocument();
    expect(nth(calls, 0).url).toBe('/api/student/active-language');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('closes without a request when the current language is picked', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ActiveLanguageSwitch student={studentWith('ja', ['en', 'ja'])} />);

    await user.click(screen.getByRole('button', { name: /Change language/ }));
    await user.click(screen.getByRole('button', { name: /日本語/ }));

    expect(calls).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Change language/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('says so when the switch fails', async () => {
    const user = userEvent.setup();
    const { fetchMock } = queueResponses([404, apiError('LANGUAGE_NOT_ADDED')]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ActiveLanguageSwitch student={studentWith('ja', ['en', 'ja'])} />);

    await user.click(screen.getByRole('button', { name: /Change language/ }));
    await user.click(screen.getByRole('button', { name: /English/ }));

    expect(
      await screen.findByText('This language is not one of yours. Refresh the page and try again.'),
    ).toBeInTheDocument();
  });
});
