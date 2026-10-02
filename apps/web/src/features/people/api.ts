import { groupPeopleResponseSchema, personResponseSchema } from '@acu/shared';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';

/** Under the group's own key, so whatever refreshes the group refreshes its people too. */
export const groupPeopleKey = (groupId: string) => ['group', groupId, 'people'] as const;

export function useGroupPeople(groupId: string) {
  return useQuery({
    queryKey: groupPeopleKey(groupId),
    queryFn: async () =>
      (await apiRequest(`/api/groups/${groupId}/people`, { schema: groupPeopleResponseSchema }))
        .people,
  });
}

export const personKey = (personId: string) => ['person', personId] as const;

export function usePerson(personId: string) {
  return useQuery({
    queryKey: personKey(personId),
    queryFn: async () =>
      (await apiRequest(`/api/people/${personId}`, { schema: personResponseSchema })).person,
  });
}
