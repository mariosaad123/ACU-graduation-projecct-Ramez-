import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SplashScreen } from '../../components/brand/SplashScreen';
import { renderWithProviders } from '../../test/render';
import { ar } from './content/ar';
import { en } from './content/en';
import { SITE_PAGES } from './content/types';
import { SitePage } from './SitePage';

describe('the public reading pages', () => {
  it('sets out a page with its sections, a way round them and the other pages', () => {
    renderWithProviders(<SitePage page="privacy" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeInTheDocument();
    expect(screen.getByText(/^Last updated:/)).toBeInTheDocument();
    const contents = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(contents).getByRole('link', { name: 'Who sees what' })).toHaveAttribute(
      'href',
      '#privacy-2',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Who sees what' })).toHaveAttribute(
      'id',
      'privacy-2',
    );
    const more = screen.getByRole('navigation', { name: 'More pages' });
    expect(within(more).getByRole('link', { name: 'Terms of use' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(within(more).queryByRole('link', { name: 'Privacy policy' })).not.toBeInTheDocument();
  });

  it('names the six languages and links to the university on the about page', () => {
    renderWithProviders(<SitePage page="about" />);

    for (const language of ['Arabic', 'English', 'French', 'German', 'Chinese', 'Japanese']) {
      expect(screen.getByText(language)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /Ahram Canadian University website/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });

  it('says the same things in both languages', () => {
    for (const page of SITE_PAGES) {
      expect(ar[page].sections).toHaveLength(en[page].sections.length);
      ar[page].sections.forEach((section, index) => {
        const other = en[page].sections[index];
        expect(section.paragraphs?.length).toBe(other?.paragraphs?.length);
        expect(section.items?.length).toBe(other?.items?.length);
        expect(section.link?.href.startsWith('https://acu.edu.eg')).toBe(
          other?.link?.href.startsWith('https://acu.edu.eg'),
        );
      });
    }
  });
});

describe('the loading screen', () => {
  it('names the platform and says it is loading', () => {
    renderWithProviders(<SplashScreen />);

    const splash = screen.getByRole('status', { name: 'Loading…' });
    expect(within(splash).getByText('ACU Languages')).toBeInTheDocument();
    expect(within(splash).getAllByRole('presentation')).toHaveLength(2);
  });
});
