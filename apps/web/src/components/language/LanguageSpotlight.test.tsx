import type { LearningLanguage, SessionUser } from '@acu/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { nth, queueResponses, renderWithProviders, sessionUser } from '../../test/render';
import { LanguageSpotlight } from './LanguageSpotlight';

function render(language: LearningLanguage, session: SessionUser | null) {
  return renderWithProviders(<LanguageSpotlight language={language} />, { session });
}

const student = (activeLanguage: LearningLanguage, languages: LearningLanguage[]) =>
  sessionUser({ role: 'student', student: { activeLanguage, languages, goal: 'study' } });

const doctor = (languages: LearningLanguage[]) =>
  sessionUser({
    role: 'doctor',
    doctor: {
      status: 'active',
      displayName: 'Dr. Mona',
      staffId: 'ACU-1',
      universityEmail: 'mona@acu.edu.eg',
      languages,
    },
  });

describe('LanguageSpotlight', () => {
  it('greets in the language and explains how it is written and levelled', () => {
    render('zh', null);

    expect(screen.getByText('你好')).toHaveAttribute('lang', 'zh');
    expect(screen.getByRole('heading', { name: 'Chinese on the platform' })).toBeInTheDocument();
    expect(screen.getByText(/Simplified Chinese characters/)).toBeInTheDocument();
    expect(screen.getByText(/familiar HSK scale/)).toBeInTheDocument();
    expect(screen.queryByText(/JLPT/)).not.toBeInTheDocument();
  });

  it('invites a visitor to start', () => {
    render('fr', null);

    expect(screen.getByRole('link', { name: 'Start learning French' })).toHaveAttribute(
      'href',
      '/sign-in',
    );
  });

  it('sends an account without a role to finish its setup', () => {
    render('fr', sessionUser());

    expect(screen.getByRole('link', { name: 'Finish setting up your account' })).toHaveAttribute(
      'href',
      '/welcome',
    );
  });

  it('offers a student the step that fits: test, switch or add', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([201, { user: student('de', ['en', 'fr', 'de']) }]);
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render('en', student('en', ['en', 'fr']));
    expect(screen.getByRole('link', { name: 'Start the placement test' })).toBeInTheDocument();
    unmount();

    const second = render('fr', student('en', ['en', 'fr']));
    expect(
      screen.getByRole('button', { name: 'Make French your current language' }),
    ).toBeInTheDocument();
    second.unmount();

    render('de', student('en', ['en', 'fr']));
    await user.click(screen.getByRole('button', { name: 'Add German to your languages' }));

    expect(await screen.findByText('German added. It is your current language now.')).toBeVisible();
    expect(nth(calls, 0)).toMatchObject({
      url: '/api/student/languages',
      init: { method: 'POST', body: JSON.stringify({ language: 'de' }) },
    });
  });

  it('lets a doctor create a group in a language they teach, or add it first', () => {
    const { unmount } = render('fr', doctor(['fr']));
    expect(screen.getByRole('link', { name: 'Create a group in French' })).toHaveAttribute(
      'href',
      '/app?newGroup=fr',
    );
    unmount();

    render('ja', doctor(['fr']));
    expect(
      screen.getByRole('link', { name: 'Add Japanese to the languages you teach' }),
    ).toHaveAttribute('href', '/app#teaching');
  });
});
