import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { Button } from './Button';
import { Dialog } from './Dialog';

function ConfirmExample({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Finish exam
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Finish the exam?"
        description="You cannot change your answers afterwards."
        footer={<Button onClick={onConfirm}>Submit</Button>}
      />
    </>
  );
}

describe('Dialog', () => {
  it('opens as an accessible modal with a title and description', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfirmExample onConfirm={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Finish exam' }));

    const dialog = screen.getByRole('dialog', { name: 'Finish the exam?' });
    expect(dialog).toHaveAccessibleDescription('You cannot change your answers afterwards.');
    expect(dialog).toHaveAttribute('open');
  });

  it('closes from the close button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfirmExample onConfirm={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Finish exam' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('passes actions through to the footer', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(<ConfirmExample onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Finish exam' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
