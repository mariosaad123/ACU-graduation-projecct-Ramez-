import type { GroupPerson, Person } from '@acu/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiError, queueResponses, renderWithProviders } from '../../test/render';
import { groupPeopleKey, personKey } from './api';
import { GroupPeople } from './GroupPeople';
import { PersonPage } from './PersonPage';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const PERSON_ID = '33333333-3333-4333-8333-333333333333';

function person(overrides: Partial<GroupPerson> = {}): GroupPerson {
  return {
    id: PERSON_ID,
    name: 'Nour Ali',
    avatarUrl: null,
    role: 'student',
    joinedAt: '2026-09-30T10:00:00.000Z',
    me: false,
    ...overrides,
  };
}

function profile(overrides: Partial<Person> = {}): Person {
  return {
    id: PERSON_ID,
    name: 'Nour Ali',
    avatarUrl: null,
    role: 'student',
    email: null,
    languages: ['fr', 'ja'],
    activeLanguage: 'ja',
    memberSince: '2026-09-01T10:00:00.000Z',
    sharedGroups: [{ id: GROUP_ID, name: 'Conversation 2', language: 'fr', photoUrl: null }],
    me: false,
    ...overrides,
  };
}

function renderPerson(data: Person) {
  return renderWithProviders(<PersonPage />, {
    route: `/app/people/${PERSON_ID}`,
    path: '/app/people/:personId',
    cache: [[personKey(PERSON_ID), data]],
  });
}

describe('the people of a group', () => {
  it('lists the doctor first and links everyone to their profile', () => {
    renderWithProviders(<GroupPeople groupId={GROUP_ID} />, {
      cache: [
        [
          groupPeopleKey(GROUP_ID),
          [
            person({ id: 'doctor-1', name: 'Dr. Mona', role: 'owner', joinedAt: null }),
            person({ id: 'me', name: 'Omar Khaled', me: true }),
            person(),
          ],
        ],
      ],
    });

    expect(screen.getByRole('heading', { name: 'Members (3)' })).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/app/people/doctor-1',
      '/app/people/me',
      `/app/people/${PERSON_ID}`,
    ]);
    expect(within(links[0] ?? never()).getByText('Doctor')).toBeInTheDocument();
    expect(within(links[1] ?? never()).getByText('You')).toBeInTheDocument();
  });

  it('shows a long class a few at a time', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 20 }, (_, index) =>
      person({ id: `student-${String(index)}`, name: `Student ${String(index)}` }),
    );
    renderWithProviders(<GroupPeople groupId={GROUP_ID} />, {
      cache: [[groupPeopleKey(GROUP_ID), many]],
    });

    expect(screen.getAllByRole('link')).toHaveLength(12);
    await user.click(screen.getByRole('button', { name: 'Show all (20)' }));
    expect(screen.getAllByRole('link')).toHaveLength(20);
  });
});

describe('a person’s profile', () => {
  it('shows a classmate’s languages and the groups in common, without an email', () => {
    renderPerson(profile());

    expect(screen.getByRole('heading', { level: 1, name: 'Nour Ali' })).toBeInTheDocument();
    expect(screen.getByText('Student')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Languages learned' })).toBeInTheDocument();
    expect(screen.getByText('Learning now')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Conversation 2' })).toHaveAttribute(
      'href',
      `/app/groups/${GROUP_ID}`,
    );
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument();
  });

  it('shows a doctor’s university email and the languages they teach', () => {
    renderPerson(
      profile({
        name: 'Dr. Mona',
        role: 'doctor',
        email: 'mona@acu.edu.eg',
        languages: ['fr', 'de'],
        activeLanguage: null,
      }),
    );

    expect(screen.getByRole('heading', { name: 'Languages taught' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'mona@acu.edu.eg' })).toHaveAttribute(
      'href',
      'mailto:mona@acu.edu.eg',
    );
  });

  it('offers to change the photo on one’s own profile', () => {
    renderPerson(profile({ me: true, email: 'nour@gmail.com' }));

    expect(screen.getByText('This is your profile as others see it.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Change your photo' })).toHaveAttribute(
      'href',
      '/app/profile',
    );
    expect(screen.queryByRole('heading', { name: 'Groups in common' })).not.toBeInTheDocument();
  });

  it('shows the missing page for someone the reader may not see', async () => {
    const { fetchMock } = queueResponses([404, apiError('NOT_FOUND')]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<PersonPage />, {
      route: `/app/people/${PERSON_ID}`,
      path: '/app/people/:personId',
    });

    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('Nour Ali');
  });
});

function never(): never {
  throw new Error('Expected an element');
}
