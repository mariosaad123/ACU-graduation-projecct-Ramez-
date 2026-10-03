import {
  agendaSchema,
  assignmentDetailSchema,
  assignmentResponseSchema,
  assignmentsResponseSchema,
  submissionRowSchema,
  type AssignmentInput,
  type AssignmentUpdate,
  type GradeInput,
} from '@acu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as z from 'zod/mini';
import { apiRequest } from '../../lib/api';
import { gradebookKey } from '../gradebook/api';

export const assignmentsKey = (groupId: string) => ['group', groupId, 'assignments'] as const;
const detailKey = (groupId: string, id: string) => [...assignmentsKey(groupId), id] as const;

const gradedResponse = z.object({ submission: submissionRowSchema });

/** A form's values as JSON in one field, with its files beside it. */
function formOf(data: object, files: readonly File[]): FormData {
  const form = new FormData();
  form.append('data', JSON.stringify(data));
  for (const file of files) {
    form.append('files', file, file.name);
  }
  return form;
}

/** What is waiting for the reader across their groups; refreshed as assignments change. */
export function useAgenda() {
  return useQuery({
    queryKey: ['agenda'],
    queryFn: () => apiRequest('/api/me/agenda', { schema: agendaSchema }),
  });
}

export function useAssignments(groupId: string) {
  return useQuery({
    queryKey: assignmentsKey(groupId),
    queryFn: async () =>
      (
        await apiRequest(`/api/groups/${groupId}/assignments`, {
          schema: assignmentsResponseSchema,
        })
      ).assignments,
  });
}

export function useAssignmentDetail(groupId: string, assignmentId: string) {
  return useQuery({
    queryKey: detailKey(groupId, assignmentId),
    queryFn: () =>
      apiRequest(`/api/groups/${groupId}/assignments/${assignmentId}`, {
        schema: assignmentDetailSchema,
      }),
  });
}

/** Assignments own a gradebook column, so whatever changes one refreshes both. */
function useRefresh(groupId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: assignmentsKey(groupId) }),
      queryClient.invalidateQueries({ queryKey: gradebookKey(groupId) }),
      queryClient.invalidateQueries({ queryKey: ['group', groupId, 'my-grades'] }),
      queryClient.invalidateQueries({ queryKey: ['agenda'] }),
    ]);
}

export function useCreateAssignment(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: async ({ input, files }: { input: AssignmentInput; files: File[] }) =>
      (
        await apiRequest(`/api/groups/${groupId}/assignments`, {
          method: 'POST',
          body: formOf(input, files),
          schema: assignmentResponseSchema,
        })
      ).assignment,
    onSuccess: refresh,
  });
}

export function useUpdateAssignment(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: async ({
      id,
      changes,
      files = [],
    }: {
      id: string;
      changes: AssignmentUpdate;
      files?: File[];
    }) =>
      (
        await apiRequest(`/api/groups/${groupId}/assignments/${id}`, {
          method: 'PATCH',
          body: formOf(changes, files),
          schema: assignmentResponseSchema,
        })
      ).assignment,
    onSuccess: refresh,
  });
}

export function useDeleteAssignment(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/groups/${groupId}/assignments/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
}

export function useSubmitWork(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: async ({
      id,
      body,
      keepFileIds,
      files,
    }: {
      id: string;
      body: string;
      keepFileIds: string[];
      files: File[];
    }) =>
      (
        await apiRequest(`/api/groups/${groupId}/assignments/${id}/submission`, {
          method: 'PUT',
          body: formOf({ body, keepFileIds }, files),
          schema: assignmentResponseSchema,
        })
      ).assignment,
    onSuccess: refresh,
  });
}

export function useWithdrawWork(groupId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/groups/${groupId}/assignments/${id}/submission`, {
        method: 'DELETE',
        schema: assignmentResponseSchema,
      }),
    onSuccess: refresh,
  });
}

export function useGradeSubmission(groupId: string, assignmentId: string) {
  const refresh = useRefresh(groupId);
  return useMutation({
    mutationFn: async ({ studentId, grade }: { studentId: string; grade: GradeInput }) =>
      (
        await apiRequest(
          `/api/groups/${groupId}/assignments/${assignmentId}/submissions/${studentId}/grade`,
          { method: 'PUT', body: grade, schema: gradedResponse },
        )
      ).submission,
    onSuccess: refresh,
  });
}
