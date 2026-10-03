import {
  announcementReceiptsSchema,
  announcementResponseSchema,
  announcementsResponseSchema,
} from '@acu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { STUDENT_GROUPS_KEY } from '../groups/api';

/** Under the group's own key, so whatever refreshes the group refreshes its announcements. */
export const announcementsKey = (groupId: string) => ['group', groupId, 'announcements'] as const;

export function useAnnouncements(groupId: string) {
  return useQuery({
    queryKey: announcementsKey(groupId),
    queryFn: async () =>
      (
        await apiRequest(`/api/groups/${groupId}/announcements`, {
          schema: announcementsResponseSchema,
        })
      ).announcements,
    refetchInterval: 60_000,
  });
}

function useRefresh(groupId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['group', groupId] }),
      queryClient.invalidateQueries({ queryKey: STUDENT_GROUPS_KEY }),
    ]);
}

export interface AnnouncementDraft {
  title: string;
  body: string;
  important: boolean;
  files: File[];
}

export function useCreateAnnouncement(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: async (draft: AnnouncementDraft) => {
      const form = new FormData();
      form.append('title', draft.title);
      form.append('body', draft.body);
      form.append('important', String(draft.important));
      for (const file of draft.files) {
        form.append('files', file, file.name);
      }
      return (
        await apiRequest(`/api/groups/${groupId}/announcements`, {
          method: 'POST',
          body: form,
          schema: announcementResponseSchema,
        })
      ).announcement;
    },
    onSuccess: refresh,
  });
}

export function useEditAnnouncement(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: async ({
      id,
      ...changes
    }: {
      id: string;
      title: string;
      body: string;
      important: boolean;
    }) =>
      (
        await apiRequest(`/api/groups/${groupId}/announcements/${id}`, {
          method: 'PATCH',
          body: changes,
          schema: announcementResponseSchema,
        })
      ).announcement,
    onSuccess: refresh,
  });
}

export function useDeleteAnnouncement(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/groups/${groupId}/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
}

export function useMarkAnnouncementsRead(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest(`/api/groups/${groupId}/announcements/read`, { method: 'POST', body: { ids } }),
    onSuccess: refresh,
  });
}

export function useAnnouncementReceipts(groupId: string, announcementId: string) {
  return useQuery({
    queryKey: [...announcementsKey(groupId), announcementId, 'receipts'],
    queryFn: () =>
      apiRequest(`/api/groups/${groupId}/announcements/${announcementId}/receipts`, {
        schema: announcementReceiptsSchema,
      }),
  });
}
