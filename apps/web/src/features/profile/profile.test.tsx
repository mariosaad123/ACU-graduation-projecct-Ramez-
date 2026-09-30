import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiError, nth, queueResponses, renderWithProviders, sessionUser } from '../../test/render';
import { ProfilePage } from './ProfilePage';

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) {
    throw new Error('The file input is missing');
  }
  return input;
}

const photo = () => new File(['photo'], 'me.png', { type: 'image/png' });

describe('the profile page', () => {
  it('uploads a photo and uses it at once', async () => {
    const user = userEvent.setup();
    const updated = sessionUser({ avatarUrl: '/api/files/avatar-1', customAvatar: true });
    const { fetchMock, calls } = queueResponses([200, { user: updated }]);
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithProviders(<ProfilePage user={sessionUser()} />);

    await user.upload(fileInput(container), photo());

    expect(await screen.findByText('Photo saved.')).toBeInTheDocument();
    expect(nth(calls, 0)).toMatchObject({ url: '/api/me/avatar', init: { method: 'PUT' } });
    expect((nth(calls, 0).init?.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('checks the type and size before uploading', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { fetchMock, calls } = queueResponses();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithProviders(<ProfilePage user={sessionUser()} />);

    await user.upload(
      fileInput(container),
      new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a JPG, PNG, WebP or GIF image.');

    const big = photo();
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    await user.upload(fileInput(container), big);
    expect(screen.getByRole('alert')).toHaveTextContent('The photo is larger than 5 MB.');
    expect(calls).toHaveLength(0);
  });

  it('explains a photo the server refused', async () => {
    const user = userEvent.setup();
    const { fetchMock } = queueResponses([415, apiError('UNSUPPORTED_FILE')]);
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithProviders(<ProfilePage user={sessionUser()} />);

    await user.upload(fileInput(container), photo());

    expect(await screen.findByRole('alert')).not.toBeEmptyDOMElement();
  });

  it('goes back to the Google picture only when there is a photo of their own', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses([200, { user: sessionUser() }]);
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderWithProviders(<ProfilePage user={sessionUser()} />);
    expect(screen.queryByRole('button', { name: 'Back to the Google picture' })).toBeNull();
    unmount();

    renderWithProviders(
      <ProfilePage user={sessionUser({ avatarUrl: '/api/files/avatar-1', customAvatar: true })} />,
    );
    await user.click(screen.getByRole('button', { name: 'Back to the Google picture' }));

    expect(await screen.findByText('Photo removed.')).toBeInTheDocument();
    expect(nth(calls, 0)).toMatchObject({ url: '/api/me/avatar', init: { method: 'DELETE' } });
  });
});
