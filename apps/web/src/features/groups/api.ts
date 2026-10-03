import {
  assistantResponseSchema,
  assistantsResponseSchema,
  assistedGroupsResponseSchema,
  groupMemberResponseSchema,
  groupMembersResponseSchema,
  groupResponseSchema,
  groupsResponseSchema,
  joinPreviewSchema,
  joinResultSchema,
  meResponseSchema,
  studentGroupsResponseSchema,
  type GroupCreateRequest,
  type GroupMemberRole,
  type GroupUpdateRequest,
  type LearningLanguage,
} from '@acu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { useSetSession } from '../auth/session';

export const DOCTOR_GROUPS_KEY = ['doctor', 'groups'] as const;
export const STUDENT_GROUPS_KEY = ['student', 'groups'] as const;

const membersKey = (groupId: string) => ['doctor', 'groups', groupId, 'members'] as const;

/* The doctor's side */

export function useDoctorGroups() {
  return useQuery({
    queryKey: DOCTOR_GROUPS_KEY,
    queryFn: async () =>
      (await apiRequest('/api/doctor/groups', { schema: groupsResponseSchema })).groups,
  });
}

export function useGroupMembers(groupId: string) {
  return useQuery({
    queryKey: membersKey(groupId),
    queryFn: async () =>
      (
        await apiRequest(`/api/doctor/groups/${groupId}/members`, {
          schema: groupMembersResponseSchema,
        })
      ).members,
  });
}

/** Anything that changes a group or its members refreshes the lists and the open group. */
function useRefreshGroups() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: DOCTOR_GROUPS_KEY }),
      queryClient.invalidateQueries({ queryKey: ['group'] }),
    ]);
}

export function useSetTeachingLanguages() {
  const setSession = useSetSession();
  return useMutation({
    mutationFn: (languages: LearningLanguage[]) =>
      apiRequest('/api/doctor/languages', {
        method: 'PUT',
        body: { languages },
        schema: meResponseSchema,
      }),
    onSuccess: ({ user }) => {
      setSession(user);
    },
  });
}

export function useCreateGroup() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: async (request: GroupCreateRequest) =>
      (
        await apiRequest('/api/doctor/groups', {
          method: 'POST',
          body: request,
          schema: groupResponseSchema,
        })
      ).group,
    onSuccess: refresh,
  });
}

export function useUpdateGroup(groupId: string) {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: async (request: GroupUpdateRequest) =>
      (
        await apiRequest(`/api/doctor/groups/${groupId}`, {
          method: 'PATCH',
          body: request,
          schema: groupResponseSchema,
        })
      ).group,
    onSuccess: refresh,
  });
}

export function useGroupCommand(groupId: string, command: 'code' | 'archive' | 'restore') {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: async () =>
      (
        await apiRequest(`/api/doctor/groups/${groupId}/${command}`, {
          method: 'POST',
          schema: groupResponseSchema,
        })
      ).group,
    onSuccess: refresh,
  });
}

export function useGroupPhoto(groupId: string) {
  const refresh = useRefreshGroups();
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return (
        await apiRequest(`/api/doctor/groups/${groupId}/photo`, {
          method: 'PUT',
          body: form,
          schema: groupResponseSchema,
        })
      ).group;
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async () =>
      (
        await apiRequest(`/api/doctor/groups/${groupId}/photo`, {
          method: 'DELETE',
          schema: groupResponseSchema,
        })
      ).group,
    onSuccess: refresh,
  });
  return { upload, remove };
}

export function useChatMute(groupId: string) {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: async ({ studentId, muted }: { studentId: string; muted: boolean }) =>
      (
        await apiRequest(`/api/doctor/groups/${groupId}/members/${studentId}/chat-mute`, {
          method: 'POST',
          body: { muted },
          schema: groupMemberResponseSchema,
        })
      ).member,
    onSuccess: refresh,
  });
}

/** Makes an active student a moderator, the representative, or a plain member again. */
export function useMemberRole(groupId: string) {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: async ({ studentId, role }: { studentId: string; role: GroupMemberRole }) =>
      (
        await apiRequest(`/api/doctor/groups/${groupId}/members/${studentId}/role`, {
          method: 'POST',
          body: { role },
          schema: groupMemberResponseSchema,
        })
      ).member,
    onSuccess: refresh,
  });
}

const assistantsKey = (groupId: string) => ['doctor', 'groups', groupId, 'assistants'] as const;
export const ASSISTED_GROUPS_KEY = ['doctor', 'assisting'] as const;

export function useAssistants(groupId: string) {
  return useQuery({
    queryKey: assistantsKey(groupId),
    queryFn: async () =>
      (
        await apiRequest(`/api/doctor/groups/${groupId}/assistants`, {
          schema: assistantsResponseSchema,
        })
      ).assistants,
  });
}

export function useAddAssistant(groupId: string) {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: async (email: string) =>
      (
        await apiRequest(`/api/doctor/groups/${groupId}/assistants`, {
          method: 'POST',
          body: { email },
          schema: assistantResponseSchema,
        })
      ).assistant,
    onSuccess: refresh,
  });
}

export function useRemoveAssistant(groupId: string) {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: (assistantId: string) =>
      apiRequest(`/api/doctor/groups/${groupId}/assistants/${assistantId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
}

/** Groups the signed-in doctor helps run as a teaching assistant. */
export function useAssistedGroups() {
  return useQuery({
    queryKey: ASSISTED_GROUPS_KEY,
    queryFn: async () =>
      (await apiRequest('/api/doctor/assisting', { schema: assistedGroupsResponseSchema })).groups,
  });
}

export type MemberAction = 'approve' | 'reject' | 'remove' | 'restore';

export function useMemberAction(groupId: string) {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: async ({ studentId, action }: { studentId: string; action: MemberAction }) =>
      (
        await apiRequest(`/api/doctor/groups/${groupId}/members/${studentId}/${action}`, {
          method: 'POST',
          schema: groupMemberResponseSchema,
        })
      ).member,
    onSuccess: refresh,
  });
}

export function useAddMember(groupId: string) {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: async (email: string) =>
      (
        await apiRequest(`/api/doctor/groups/${groupId}/members`, {
          method: 'POST',
          body: { email },
          schema: groupMemberResponseSchema,
        })
      ).member,
    onSuccess: refresh,
  });
}

export function useMoveMember(groupId: string) {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: async ({ studentId, toGroupId }: { studentId: string; toGroupId: string }) =>
      (
        await apiRequest(`/api/doctor/groups/${groupId}/members/${studentId}/move`, {
          method: 'POST',
          body: { toGroupId },
          schema: groupMemberResponseSchema,
        })
      ).member,
    onSuccess: refresh,
  });
}

export function useSuspension() {
  const refresh = useRefreshGroups();
  return useMutation({
    mutationFn: ({ studentId, reason }: { studentId: string; reason: string | null }) =>
      reason === null
        ? apiRequest(`/api/doctor/students/${studentId}/unsuspend`, { method: 'POST' })
        : apiRequest(`/api/doctor/students/${studentId}/suspend`, {
            method: 'POST',
            body: { reason },
          }),
    onSuccess: refresh,
  });
}

/* The student's side */

export function useStudentGroups() {
  return useQuery({
    queryKey: STUDENT_GROUPS_KEY,
    queryFn: async () =>
      (await apiRequest('/api/student/groups', { schema: studentGroupsResponseSchema })).groups,
  });
}

export function useJoinPreview() {
  return useMutation({
    mutationFn: (code: string) =>
      apiRequest('/api/student/join/preview', {
        method: 'POST',
        body: { code },
        schema: joinPreviewSchema,
      }),
  });
}

export function useJoinGroup() {
  const queryClient = useQueryClient();
  const setSession = useSetSession();
  return useMutation({
    mutationFn: (code: string) =>
      apiRequest('/api/student/join', {
        method: 'POST',
        body: { code },
        schema: joinResultSchema,
      }),
    onSuccess: async (result) => {
      setSession(result.user);
      await queryClient.invalidateQueries({ queryKey: STUDENT_GROUPS_KEY });
    },
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) =>
      apiRequest(`/api/student/groups/${groupId}/leave`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STUDENT_GROUPS_KEY }),
  });
}
