import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { nth, renderWithProviders } from '../../test/render';
import { CodeInput } from './CodeInput';

function Harness({ onComplete }: { onComplete: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <>
      <CodeInput label="Code" value={value} onChange={setValue} onComplete={onComplete} />
      <output>{value}</output>
    </>
  );
}

const boxes = () => screen.getAllByRole('textbox');

describe('CodeInput', () => {
  it('renders one labelled box per digit inside a named group', () => {
    renderWithProviders(<Harness onComplete={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'Code' })).toBeInTheDocument();
    expect(boxes()).toHaveLength(6);
    expect(boxes()[0]).toHaveAccessibleName('Code 1/6');
    expect(boxes()[0]).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('moves to the next box as digits are typed and completes at the end', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderWithProviders(<Harness onComplete={onComplete} />);

    await user.click(nth(boxes(), 0));
    await user.keyboard('042917');

    expect(screen.getByRole('status')).toHaveTextContent('042917');
    expect(onComplete).toHaveBeenCalledWith('042917');
  });

  it('ignores letters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness onComplete={vi.fn()} />);

    await user.click(nth(boxes(), 0));
    await user.keyboard('4a2');

    expect(screen.getByRole('status')).toHaveTextContent('42');
  });

  it('fills every box from a pasted code, including Arabic digits', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderWithProviders(<Harness onComplete={onComplete} />);

    await user.click(nth(boxes(), 0));
    await user.paste('٠٤٢٩١٧');

    expect(onComplete).toHaveBeenCalledWith('042917');
  });

  it('steps back with Backspace', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness onComplete={vi.fn()} />);

    await user.click(nth(boxes(), 0));
    await user.keyboard('123{Backspace}{Backspace}');

    expect(screen.getByRole('status')).toHaveTextContent(/^1$/);
  });
});
