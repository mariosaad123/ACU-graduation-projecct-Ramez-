import {
  gradeColumnSchema,
  gradeSchema,
  gradebookSchema,
  myGradesSchema,
  type GradeColumnInput,
  type GradeInput,
  type Gradebook,
} from '@acu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as z from 'zod/mini';
import { apiRequest } from '../../lib/api';

export const gradebookKey = (groupId: string) => ['group', groupId, 'gradebook'] as const;

const columnResponse = z.object({ column: gradeColumnSchema });
const gradesResponse = z.object({ grades: z.array(gradeSchema) });

export function useGradebook(groupId: string) {
  return useQuery({
    queryKey: gradebookKey(groupId),
    queryFn: () => apiRequest(`/api/groups/${groupId}/gradebook`, { schema: gradebookSchema }),
  });
}

export function useMyGrades(groupId: string) {
  return useQuery({
    queryKey: ['group', groupId, 'my-grades'],
    queryFn: () => apiRequest(`/api/groups/${groupId}/my-grades`, { schema: myGradesSchema }),
  });
}

export function useSaveColumn(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string | null; input: GradeColumnInput }) =>
      (
        await apiRequest(
          id
            ? `/api/groups/${groupId}/gradebook/columns/${id}`
            : `/api/groups/${groupId}/gradebook/columns`,
          { method: id ? 'PATCH' : 'POST', body: input, schema: columnResponse },
        )
      ).column,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gradebookKey(groupId) }),
  });
}

export function useDeleteColumn(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/groups/${groupId}/gradebook/columns/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gradebookKey(groupId) }),
  });
}

/**
 * Saves cells of one column. The table shows the change at once and puts the old values back if
 * the server refuses, so entering a column of scores never waits on the network.
 */
export function useSetGrades(groupId: string) {
  const queryClient = useQueryClient();
  const key = gradebookKey(groupId);
  return useMutation({
    mutationFn: async ({
      columnId,
      entries,
    }: {
      columnId: string;
      entries: (GradeInput & { studentId: string })[];
    }) =>
      (
        await apiRequest(`/api/groups/${groupId}/gradebook/columns/${columnId}/grades`, {
          method: 'PUT',
          body: { entries },
          schema: gradesResponse,
        })
      ).grades,
    onMutate: async ({ columnId, entries }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<Gradebook>(key);
      if (before) {
        const changed = new Set(entries.map((entry) => entry.studentId));
        const kept = before.grades.filter(
          (grade) => grade.columnId !== columnId || !changed.has(grade.studentId),
        );
        const added = entries
          .filter((entry) => entry.status !== 'scored' || entry.score !== null || entry.note)
          .map((entry) => ({ columnId, updatedAt: new Date().toISOString(), ...entry }));
        queryClient.setQueryData<Gradebook>(key, { ...before, grades: [...kept, ...added] });
      }
      return { before };
    },
    onError: (_error, _variables, context) => {
      if (context?.before) {
        queryClient.setQueryData(key, context.before);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
