import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { useToast } from './toast-context';

function Trigger({ durationMs }: { durationMs?: number }) {
  const show = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        show({ title: 'Progress saved', tone: 'success', durationMs });
      }}
    >
      Save
    </button>
  );
}

describe('toasts', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('announces a toast in a polite live region', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<Trigger />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(region.querySelector('[aria-live="polite"]')).toHaveTextContent('Progress saved');
  });

  it('dismisses itself after its duration', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<Trigger durationMs={3000} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Progress saved')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.queryByText('Progress saved')).not.toBeInTheDocument();
  });

  it('can be dismissed by hand', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<Trigger />);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    expect(screen.queryByText('Progress saved')).not.toBeInTheDocument();
  });

  it('keeps at most three toasts on screen', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<Trigger />);

    for (let index = 0; index < 5; index += 1) {
      await user.click(screen.getByRole('button', { name: 'Save' }));
    }

    expect(screen.getAllByText('Progress saved')).toHaveLength(3);
  });
});
