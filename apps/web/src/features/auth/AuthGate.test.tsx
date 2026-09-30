import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLocation } from 'react-router';
import { renderWithProviders, sessionUser } from '../../test/render';
import { AuthGate } from './AuthGate';

function Where() {
  const location = useLocation();
  return <p>at {`${location.pathname}${location.search}`}</p>;
}

const redirects = {
  '/sign-in': <Where />,
  '/welcome': <Where />,
  '/welcome/doctor': <Where />,
  '/app': <Where />,
};

const doctor = sessionUser({
  role: 'doctor',
  doctor: {
    status: 'active',
    displayName: 'Dr. Mona',
    staffId: 'ACU-1',
    universityEmail: 'mona@acu.edu.eg',
  },
});

describe('AuthGate for pages that need a role', () => {
  const page = (roles: ('student' | 'doctor' | 'admin')[]) => (
    <AuthGate rule={{ kind: 'role', roles }}>{() => <p>private page</p>}</AuthGate>
  );

  it('sends visitors to sign in and remembers where they were going', async () => {
    renderWithProviders(page(['student']), {
      route: '/app?tab=1',
      session: null,
      extraRoutes: { '/sign-in': <Where /> },
    });

    expect(await screen.findByText('at /sign-in?returnTo=%2Fapp%3Ftab%3D1')).toBeInTheDocument();
  });

  it('sends accounts without a role to the role choice', async () => {
    renderWithProviders(page(['student']), {
      route: '/app',
      session: sessionUser(),
      extraRoutes: redirects,
    });

    expect(await screen.findByText('at /welcome')).toBeInTheDocument();
  });

  it('shows the page to an allowed role', () => {
    renderWithProviders(page(['doctor']), { route: '/app', session: doctor });

    expect(screen.getByText('private page')).toBeInTheDocument();
  });

  it('refuses other roles with a 403 page', () => {
    renderWithProviders(page(['doctor']), {
      route: '/app',
      session: sessionUser({ role: 'student' }),
    });

    expect(
      screen.getByRole('heading', { name: 'This page is not for your account' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('private page')).not.toBeInTheDocument();
  });
});

describe('AuthGate for setup pages', () => {
  const setup = <AuthGate rule={{ kind: 'setup' }}>{() => <p>setup page</p>}</AuthGate>;

  it('lets an account without a role finish setting up', () => {
    renderWithProviders(setup, { route: '/welcome', session: sessionUser() });

    expect(screen.getByText('setup page')).toBeInTheDocument();
  });

  it('sends accounts that are already set up to their dashboard', async () => {
    renderWithProviders(setup, { route: '/welcome', session: doctor, extraRoutes: redirects });

    expect(await screen.findByText('at /app')).toBeInTheDocument();
  });
});

describe('AuthGate for the sign-in page', () => {
  const signIn = <AuthGate rule={{ kind: 'visitor' }}>{() => <p>sign-in page</p>}</AuthGate>;

  it('shows sign-in to visitors', () => {
    renderWithProviders(signIn, { route: '/sign-in', session: null });

    expect(screen.getByText('sign-in page')).toBeInTheDocument();
  });

  it('moves signed-in people on, to the email step when a doctor is waiting for it', async () => {
    renderWithProviders(signIn, {
      route: '/sign-in',
      session: sessionUser({
        doctor: {
          status: 'pending_verification',
          displayName: 'Dr. Mona',
          staffId: 'ACU-1',
          universityEmail: 'mona@acu.edu.eg',
        },
      }),
      extraRoutes: redirects,
    });

    expect(await screen.findByText('at /welcome/doctor')).toBeInTheDocument();
  });
});
