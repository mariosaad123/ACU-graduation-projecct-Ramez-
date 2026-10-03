import { LEARNING_LANGUAGES, type LearningLanguage } from '@acu/shared';
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
  it('offers every language as a labelled radio group', () => {
    renderWithProviders(<Picker />);

    expect(screen.getByRole('group', { name: 'Choose a language to learn' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(LEARNING_LANGUAGES.length);
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

function MultiPicker({ onChange }: { onChange?: (languages: LearningLanguage[]) => void }) {
  const [languages, setLanguages] = useState<LearningLanguage[]>([]);
  return (
    <LanguagePicker
      multiple
      value={languages}
      onChange={(next) => {
        setLanguages(next);
        onChange?.(next);
      }}
    />
  );
}

function bladeOf(container: HTMLElement, language: LearningLanguage): Element {
  const blade = container.querySelector(`svg text[lang="${language}"]`)?.parentElement;
  if (!blade) {
    throw new Error(`${language} blade not rendered`);
  }
  return blade;
}

describe('LanguagePicker with several languages', () => {
  it('offers checkboxes and keeps the order languages were picked in', async () => {
    const user = userEvent.setup();
    const changes: LearningLanguage[][] = [];
    renderWithProviders(<MultiPicker onChange={(next) => changes.push(next)} />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(LEARNING_LANGUAGES.length);
    await user.click(screen.getByRole('checkbox', { name: /Français/ }));
    await user.click(screen.getByRole('checkbox', { name: /English/ }));

    expect(changes.at(-1)).toEqual(['fr', 'en']);
    expect(screen.getByRole('checkbox', { name: /Français/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /English/ })).toBeChecked();
  });

  it('removes a language when it is picked again, from its option or its blade', async () => {
    const user = userEvent.setup();
    const changes: LearningLanguage[][] = [];
    const { container } = renderWithProviders(
      <MultiPicker onChange={(next) => changes.push(next)} />,
    );

    await user.click(bladeOf(container, 'de'));
    await user.click(bladeOf(container, 'zh'));
    await user.click(screen.getByRole('checkbox', { name: /Deutsch/ }));

    expect(changes.at(-1)).toEqual(['zh']);
    expect(bladeOf(container, 'zh')).toHaveAttribute('data-selected', 'true');
    expect(bladeOf(container, 'de')).toHaveAttribute('data-selected', 'false');
  });
});

describe('LanguagePicker with unavailable languages', () => {
  function PickerWithout({ onChange }: { onChange: (language: LearningLanguage) => void }) {
    return (
      <LanguagePicker
        value={null}
        onChange={onChange}
        unavailable={['en', 'fr']}
        unavailableNote="added"
        error="Choose a language to add."
      />
    );
  }

  it('shows them, says why, and does not let them be chosen', async () => {
    const user = userEvent.setup();
    const chosen: LearningLanguage[] = [];
    const { container } = renderWithProviders(
      <PickerWithout onChange={(language) => chosen.push(language)} />,
    );

    const english = screen.getByRole('radio', { name: /English.*added/ });
    expect(english).toBeDisabled();
    await user.click(bladeOf(container, 'fr'));
    expect(chosen).toEqual([]);

    await user.click(screen.getByRole('radio', { name: /Deutsch/ }));
    expect(chosen).toEqual(['de']);
  });

  it('describes an error on the whole group', () => {
    renderWithProviders(<PickerWithout onChange={() => undefined} />);

    const group = screen.getByRole('group', { name: 'Choose a language to learn' });
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(group).toHaveAccessibleDescription('Choose a language to add.');
  });
});
