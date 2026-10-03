import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { renderWithProviders } from '../../test/render';
import { ConnectionBanner } from '../layout/ConnectionBanner';
import { LoadError } from './LoadError';

describe('a failed load', () => {
  it('says what went wrong in plain words and offers another try', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(
      <LoadError error={new ApiError(0, 'NETWORK_ERROR', 'offline')} onRetry={onRetry} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/could not reach the server/i);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('the connection banner', () => {
  it('appears while offline and says when the connection is back', async () => {
    renderWithProviders(<ConnectionBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    window.dispatchEvent(new Event('offline'));
    expect(await screen.findByText(/You are offline/)).toBeInTheDocument();

    window.dispatchEvent(new Event('online'));
    expect(await screen.findByText('You are back online.')).toBeInTheDocument();
    expect(screen.queryByText(/You are offline/)).not.toBeInTheDocument();
  });
});
