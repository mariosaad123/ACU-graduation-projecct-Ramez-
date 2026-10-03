import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiError, nth, queueResponses, renderWithProviders, sessionUser } from '../../test/render';
import { StudentSetupPage } from './StudentSetupPage';

const dashboard = { '/app': <p>dashboard</p> };

function student(activeLanguage: 'en' | 'fr' | 'ja', languages: ('en' | 'fr' | 'ja')[]) {
  return {
    user: sessionUser({
      role: 'student',
      student: { activeLanguage, languages, goal: 'study', universityId: null },
    }),
  };
}

function sentBody(calls: { init: RequestInit | undefined }[]): unknown {
  const body = nth(calls, 0).init?.body;
  return typeof body === 'string' ? JSON.parse(body) : undefined;
}

describe('StudentSetupPage', () => {
  it('asks for at least one language before sending anything', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StudentSetupPage />, { route: '/welcome/student' });

    await user.click(screen.getByRole('button', { name: 'Create my account' }));

    expect(calls).toHaveLength(0);
    const group = screen.getByRole('group', { name: 'Choose one language or more' });
    expect(group).toHaveAccessibleDescription('Choose at least one language.');
    expect(screen.getByRole('checkbox', { name: /العربية/ })).toHaveFocus();
  });

  it('clears the message once a language is picked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudentSetupPage />, { route: '/welcome/student' });

    await user.click(screen.getByRole('button', { name: 'Create my account' }));
    await user.click(screen.getByRole('checkbox', { name: /Français/ }));

    expect(screen.queryByText('Choose at least one language.')).not.toBeInTheDocument();
  });

  it('sends one language as the active one, then opens the dashboard', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([200, student('fr', ['fr'])]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StudentSetupPage />, {
      route: '/welcome/student',
      extraRoutes: dashboard,
    });

    await user.click(screen.getByRole('checkbox', { name: /Français/ }));
    await user.click(screen.getByRole('radio', { name: /Travel/ }));
    expect(screen.queryByRole('group', { name: 'Which language do you start with?' })).toBeNull();
    await user.type(screen.getByLabelText(/University ID/), ' 20231234 ');
    await user.click(screen.getByRole('button', { name: 'Create my account' }));

    expect(await screen.findByText('dashboard')).toBeInTheDocument();
    expect(nth(calls, 0).url).toBe('/api/onboarding/student');
    expect(sentBody(calls)).toEqual({
      languages: ['fr'],
      activeLanguage: 'fr',
      goal: 'travel',
      universityId: '20231234',
    });
  });

  it('starts with the first language picked unless the student chooses another', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([200, student('ja', ['en', 'ja'])]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StudentSetupPage />, {
      route: '/welcome/student',
      extraRoutes: dashboard,
    });

    await user.click(screen.getByRole('checkbox', { name: /日本語/ }));
    await user.click(screen.getByRole('checkbox', { name: /English/ }));

    const start = screen.getByRole('group', { name: 'Which language do you start with?' });
    expect(start).toHaveAccessibleDescription(/one language at a time/);
    expect(screen.getByRole('radio', { name: 'Japanese' })).toBeChecked();

    await user.type(screen.getByLabelText(/University ID/), '2023-A17');
    await user.click(screen.getByRole('button', { name: 'Create my account' }));
    await screen.findByText('dashboard');
    expect(sentBody(calls)).toEqual({
      languages: ['ja', 'en'],
      activeLanguage: 'ja',
      goal: 'study',
      universityId: '2023-A17',
    });
  });

  it('falls back to the first language when the chosen start is deselected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudentSetupPage />, { route: '/welcome/student' });

    await user.click(screen.getByRole('checkbox', { name: /Français/ }));
    await user.click(screen.getByRole('checkbox', { name: /Deutsch/ }));
    await user.click(screen.getByRole('checkbox', { name: /English/ }));
    await user.click(screen.getByRole('radio', { name: 'English' }));
    await user.click(screen.getByRole('checkbox', { name: /English/ }));

    expect(screen.getByRole('radio', { name: 'French' })).toBeChecked();
  });

  it('shows what went wrong when the server refuses', async () => {
    const user = userEvent.setup();
    const { fetchMock } = queueResponses([409, apiError('ALREADY_ONBOARDED')]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StudentSetupPage />, { route: '/welcome/student' });

    await user.click(screen.getByRole('checkbox', { name: /English/ }));
    await user.type(screen.getByLabelText(/University ID/), '20231234');
    await user.click(screen.getByRole('button', { name: 'Create my account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your account is already set up.');
  });

  it('asks for the university number before anything is sent', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StudentSetupPage />, { route: '/welcome/student' });

    await user.click(screen.getByRole('checkbox', { name: /English/ }));
    await user.click(screen.getByRole('button', { name: 'Create my account' }));

    const field = screen.getByLabelText(/University ID/);
    expect(field).toHaveAccessibleDescription(/Enter it as on the card/);
    expect(field).toHaveFocus();
    expect(calls).toHaveLength(0);
  });

  it('says on the field itself when the number belongs to another account', async () => {
    const user = userEvent.setup();
    const { fetchMock } = queueResponses([409, apiError('UNIVERSITY_ID_TAKEN')]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<StudentSetupPage />, { route: '/welcome/student' });

    await user.click(screen.getByRole('checkbox', { name: /English/ }));
    await user.type(screen.getByLabelText(/University ID/), '20231234');
    await user.click(screen.getByRole('button', { name: 'Create my account' }));

    await vi.waitFor(() => {
      expect(screen.getByLabelText(/University ID/)).toHaveAccessibleDescription(
        /already on another account/,
      );
    });
    // What was chosen is still there for another try.
    expect(screen.getByRole('checkbox', { name: /English/ })).toBeChecked();
    expect(screen.getByLabelText(/University ID/)).toHaveValue('20231234');
  });
});
