import type { LearningLanguage } from '@acu/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { LanguagePicker } from './LanguagePicker';

function Picker() {
  const [language, setLanguage] = useState<LearningLanguage>('en');
  return <LanguagePicker value={language} onChange={setLanguage} />;
}

describe('LanguagePicker', () => {
  it('offers the six languages as a labelled radio group', () => {
    renderWithProviders(<Picker />);

    expect(screen.getByRole('group', { name: 'Choose a language to learn' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.getByRole('radio', { name: /English/ })).toBeChecked();
  });

  it('names each language natively and in the interface language', () => {
    renderWithProviders(<Picker />, { locale: 'ar' });

    expect(screen.getByRole('radio', { name: /日本語.*اليابانية/ })).toBeInTheDocument();
  });

  it('selects a language from its option', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Picker />);

    await user.click(screen.getByRole('radio', { name: /Deutsch/ }));

    expect(screen.getByRole('radio', { name: /Deutsch/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /English/ })).not.toBeChecked();
  });

  it('selects a language from its aperture blade', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Picker />);

    const blade = container.querySelector('svg text[lang="ja"]')?.parentElement;
    if (!blade) {
      throw new Error('Japanese blade not rendered');
    }
    await user.click(blade);

    expect(screen.getByRole('radio', { name: /日本語/ })).toBeChecked();
  });
});
