import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { Button } from './Button';
import { RadioGroup } from './RadioGroup';
import { TextField } from './TextField';

describe('TextField', () => {
  it('connects the label, hint and error to the input', () => {
    renderWithProviders(
      <TextField
        label="University email"
        hint="Use your ACU address"
        error="Enter a valid email"
      />,
    );

    const input = screen.getByRole('textbox', { name: 'University email' });
    expect(input).toHaveAccessibleDescription('Use your ACU address Enter a valid email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toBeRequired();
  });

  it('marks optional fields in the label instead of the required ones', () => {
    renderWithProviders(<TextField label="Nickname" optional />);

    const input = screen.getByRole('textbox', { name: 'Nickname (Optional)' });
    expect(input).not.toBeRequired();
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});

describe('Button', () => {
  it('blocks repeated clicks while loading and says it is busy', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithProviders(
      <Button loading onClick={onClick}>
        Submit
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Submit' });
    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('RadioGroup', () => {
  it('reports the chosen value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <RadioGroup
        legend="Goal"
        name="goal"
        value="study"
        onChange={onChange}
        options={[
          { value: 'study', label: 'Study' },
          { value: 'work', label: 'Work', hint: 'Emails and interviews' },
        ]}
      />,
    );

    expect(screen.getByRole('group', { name: 'Goal' })).toBeInTheDocument();
    const work = screen.getByRole('radio', { name: 'Work' });
    expect(work).toHaveAccessibleDescription('Emails and interviews');

    await user.click(work);
    expect(onChange).toHaveBeenCalledWith('work');
  });
});
