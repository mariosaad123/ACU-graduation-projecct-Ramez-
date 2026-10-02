import { meResponseSchema, type LearningLanguage, type MeResponse } from '@acu/shared';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { useSetSession } from '../auth/session';

/** Every change answers with the updated account, which replaces the cached session. */
function useLanguageMutation(request: (language: LearningLanguage) => Promise<MeResponse>) {
  const setSession = useSetSession();
  return useMutation({
    mutationFn: request,
    onSuccess: ({ user }) => {
      setSession(user);
    },
  });
}

/** Adds a language; the API makes it the active one. */
export function useAddLanguage() {
  return useLanguageMutation((language) =>
    apiRequest('/api/student/languages', {
      method: 'POST',
      body: { language },
      schema: meResponseSchema,
    }),
  );
}

export function useSwitchLanguage() {
  return useLanguageMutation((language) =>
    apiRequest('/api/student/active-language', {
      method: 'PUT',
      body: { language },
      schema: meResponseSchema,
    }),
  );
}

export function useRemoveLanguage() {
  return useLanguageMutation((language) =>
    apiRequest(`/api/student/languages/${language}`, {
      method: 'DELETE',
      schema: meResponseSchema,
    }),
  );
}
