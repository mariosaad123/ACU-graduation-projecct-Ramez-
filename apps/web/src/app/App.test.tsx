import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SiteHeader } from '../components/layout/SiteHeader';
import { renderWithProviders } from '../test/render';

describe('interface language', () => {
  it('sets the document language and direction for Arabic', () => {
    renderWithProviders(<SiteHeader />, { locale: 'ar' });

    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('link', { name: 'تحديد المستوى' })).toBeInTheDocument();
  });

  it('switches to English, flips the direction and remembers the choice', async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderWithProviders(<SiteHeader />, { locale: 'ar' });

    await user.click(screen.getByRole('button', { name: 'Switch the interface to English' }));

    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    expect(screen.getAllByRole('link', { name: 'Placement test' }).length).toBeGreaterThan(0);
    expect(setItem).toHaveBeenCalledWith('acu.locale', 'en');
  });
});

describe('SiteHeader', () => {
  it('opens and closes the mobile menu, returning focus on Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteHeader />);

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
    renderWithProviders(<SiteHeader />, { route: '/library' });

    const [current] = screen.getAllByRole('link', { name: 'Library' });
    expect(current).toHaveAttribute('aria-current', 'page');
  });
});
