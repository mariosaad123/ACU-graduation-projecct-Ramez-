import type { Notification } from '@acu/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { NotificationList } from './NotificationList';

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notification-1',
    kind: 'mention',
    group: { id: 'group-1', name: 'Deutsch 1' },
    actor: { id: 'doctor-1', name: 'Dr. Mona', avatarUrl: null },
    excerpt: 'Welcome @all',
    link: '/app/groups/group-1?tab=chat&message=message-1',
    createdAt: new Date().toISOString(),
    read: false,
    ...overrides,
  };
}

describe('the notifications list', () => {
  it('says what happened and where, and leads to it', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const mention = notification();
    renderWithProviders(
      <NotificationList
        notifications={[
          mention,
          notification({ id: 'notification-2', kind: 'grade', actor: null, excerpt: 'Quiz 1' }),
        ]}
        onOpen={onOpen}
      />,
    );

    const link = screen.getByRole('link', { name: /Dr. Mona mentioned you in Deutsch 1/ });
    expect(link).toHaveAttribute('href', mention.link);
    expect(screen.getByText('New grade in Deutsch 1')).toBeInTheDocument();
    expect(screen.getByText('Quiz 1')).toBeInTheDocument();

    await user.click(link);
    expect(onOpen).toHaveBeenCalledWith(mention);
  });

  it('names a new role in the reader’s language rather than by its key', () => {
    renderWithProviders(
      <NotificationList
        notifications={[notification({ kind: 'role', actor: null, excerpt: 'moderator' })]}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('A new role for you in Deutsch 1')).toBeInTheDocument();
    expect(screen.getByText('Moderator')).toBeInTheDocument();
    expect(screen.queryByText('moderator')).not.toBeInTheDocument();
  });
});
