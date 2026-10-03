import { LEARNING_LANGUAGES } from '@acu/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, sessionUser } from '../test/render';
import { HomePage } from './HomePage';

describe('the home page', () => {
  it('invites a visitor to start, and explains the way in three steps', () => {
    renderWithProviders(<HomePage />, { session: null });

    expect(
      screen.getByRole('heading', { level: 1, name: /Learn seven languages/ }),
    ).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Get started' })) {
      expect(link).toHaveAttribute('href', '/sign-in');
    }
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '#journey');

    const journey = screen.getByRole('region', { name: 'Your way in three steps' });
    expect(within(journey).getAllByRole('listitem')).toHaveLength(3);
    expect(
      within(journey).getByRole('img', { name: 'The six levels, from A1 to C2' }),
    ).toBeInTheDocument();
  });

  it('offers every language, and greets in each of them', () => {
    renderWithProviders(<HomePage />, { session: null });

    expect(screen.getAllByRole('radio')).toHaveLength(LEARNING_LANGUAGES.length);
    for (const greeting of ['مرحبًا', 'Bonjour', '¡Hola!', '你好', 'こんにちは']) {
      expect(screen.getAllByText(greeting).length).toBeGreaterThan(0);
    }
  });

  it('is honest about what can be used today', () => {
    renderWithProviders(<HomePage />, { session: null });

    const areas = screen.getByRole('region', { name: 'Everything on the platform' });
    const groups = within(areas).getByRole('link', { name: /^Groups/ });
    expect(groups).toHaveAttribute('href', '/app');
    expect(within(groups).getByText('Available now')).toBeInTheDocument();
    const placement = within(areas).getByRole('link', { name: /^Placement test/ });
    expect(within(placement).getByText('Coming soon')).toBeInTheDocument();
    for (const skill of ['Listening', 'Speaking', 'Reading', 'Writing']) {
      expect(within(areas).getByRole('link', { name: new RegExp(`^${skill}`) })).toHaveAttribute(
        'href',
        '/skills',
      );
    }
  });

  it('sends someone signed in to their dashboard, or to finish setting up', () => {
    const { unmount } = renderWithProviders(<HomePage />, {
      session: sessionUser({ role: 'student' }),
    });
    for (const link of screen.getAllByRole('link', { name: 'Go to my dashboard' })) {
      expect(link).toHaveAttribute('href', '/app');
    }
    expect(screen.queryByRole('link', { name: 'Get started' })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<HomePage />, { session: sessionUser() });
    for (const link of screen.getAllByRole('link', { name: 'Finish setting up your account' })) {
      expect(link).toHaveAttribute('href', '/welcome');
    }
  });
});
