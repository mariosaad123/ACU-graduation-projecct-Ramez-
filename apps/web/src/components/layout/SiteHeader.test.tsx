import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthGate } from '../../features/auth/AuthGate';
import { reloadTo } from '../../lib/browser';
import { queueResponses, renderWithProviders, sessionUser } from '../../test/render';
import { SiteHeader } from './SiteHeader';

vi.mock('../../lib/browser', () => ({ reloadTo: vi.fn() }));

describe('interface language', () => {
  it('sets the document language and direction for Arabic', () => {
    renderWithProviders(<SiteHeader />, { locale: 'ar', session: null });

    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('link', { name: 'تحديد المستوى' })).toBeInTheDocument();
  });

  it('switches to English, flips the direction and remembers the choice', async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderWithProviders(<SiteHeader />, { locale: 'ar', session: null });

    await user.click(screen.getByRole('button', { name: 'Switch the interface to English' }));

    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    expect(screen.getAllByRole('link', { name: 'Placement test' }).length).toBeGreaterThan(0);
    expect(setItem).toHaveBeenCalledWith('acu.locale', 'en');
  });
});

describe('SiteHeader navigation', () => {
  it('opens and closes the mobile menu, returning focus on Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteHeader />, { session: null });

    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('Close menu');

    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('marks the current section in the navigation', () => {
    renderWithProviders(<SiteHeader />, { route: '/library', session: null });

    const [current] = screen.getAllByRole('link', { name: 'Library' });
    expect(current).toHaveAttribute('aria-current', 'page');
  });
});

describe('SiteHeader account', () => {
  it('offers sign-in to visitors', () => {
    renderWithProviders(<SiteHeader />, { session: null });

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
    expect(screen.queryByRole('button', { name: /Account menu/ })).not.toBeInTheDocument();
  });

  it('shows a student their account, role and dashboard link', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteHeader />, {
      session: sessionUser({
        role: 'student',
        student: { activeLanguage: 'fr', languages: ['fr'], goal: 'travel' },
      }),
    });

    await user.click(screen.getByRole('button', { name: 'Account menu: Salma Hassan' }));

    expect(screen.getByText('Student')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My dashboard' })).toHaveAttribute('href', '/app');
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('points an account without a role back to setup', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteHeader />, { session: sessionUser() });

    await user.click(screen.getByRole('button', { name: /Account menu/ }));

    const panel = screen.getByRole('link', { name: 'Finish setting up your account' });
    expect(panel).toHaveAttribute('href', '/welcome');
  });

  it('sends a doctor waiting for email confirmation to that step', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteHeader />, {
      session: sessionUser({
        doctor: {
          status: 'pending_verification',
          displayName: 'Dr. Mona',
          staffId: 'ACU-1',
          universityEmail: 'mona@acu.edu.eg',
          languages: ['fr'],
        },
      }),
    });

    await user.click(screen.getByRole('button', { name: /Account menu/ }));

    expect(screen.getByText('University email not confirmed yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Finish setting up your account' })).toHaveAttribute(
      'href',
      '/welcome/doctor',
    );
  });

  it('signs out on the server, then reloads the home page without detouring to sign-in', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([204]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <>
        <SiteHeader />
        <AuthGate rule={{ kind: 'role', roles: ['student'] }}>{() => <p>dashboard</p>}</AuthGate>
      </>,
      {
        route: '/app',
        session: sessionUser({ role: 'student' }),
        extraRoutes: { '/sign-in': <p>sign-in page</p> },
      },
    );

    await user.click(screen.getByRole('button', { name: /Account menu/ }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(reloadTo).toHaveBeenCalledWith('/');
    });
    expect(calls[0]).toMatchObject({ url: '/api/auth/sign-out', init: { method: 'POST' } });
    expect(screen.queryByText('sign-in page')).not.toBeInTheDocument();
  });

  it('shows a student their current language, and no one else', () => {
    const { unmount } = renderWithProviders(<SiteHeader />, {
      session: sessionUser({
        role: 'student',
        student: { activeLanguage: 'de', languages: ['en', 'de'], goal: 'study' },
      }),
    });
    expect(
      screen.getByRole('button', { name: 'Change language, current: German' }),
    ).toBeInTheDocument();
    unmount();

    renderWithProviders(<SiteHeader />, { session: sessionUser() });
    expect(screen.queryByRole('button', { name: /Change language/ })).not.toBeInTheDocument();
  });

  it('closes the account menu with Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteHeader />, { session: sessionUser({ role: 'student' }) });

    const trigger = screen.getByRole('button', { name: /Account menu/ });
    await user.click(trigger);
    const panel = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
    if (!panel) {
      throw new Error('The account menu panel is not linked to its button');
    }
    expect(panel).toBeVisible();
    expect(within(panel).getByText('salma@gmail.com')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });
});
