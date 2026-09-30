import { meResponseSchema, type SessionUser } from '@acu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '../../lib/api';

export const SESSION_QUERY_KEY = ['session'] as const;

/** The signed-in account, or null for visitors. */
async function fetchSession(): Promise<SessionUser | null> {
  try {
    const { user } = await apiRequest('/api/me', { schema: meResponseSchema });
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/** Stores an account returned by the API, e.g. after onboarding, without a second request. */
export function useSetSession() {
  const queryClient = useQueryClient();
  return (user: SessionUser | null) => {
    queryClient.setQueryData(SESSION_QUERY_KEY, user);
  };
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest('/api/auth/sign-out', { method: 'POST' }),
    onSuccess: () => {
      // The session becomes "visitor" at once; everything cached for the account is dropped.
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0],
      });
    },
  });
}

/** Full-page navigation to the API, which redirects to Google. */
export function googleSignInUrl(returnTo?: string | null): string {
  return returnTo
    ? `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`
    : '/api/auth/google/start';
}

/** Where an account belongs: unfinished setup first, otherwise the dashboard. */
export function landingPathFor(user: SessionUser): string {
  if (!user.role) {
    return user.doctor?.status === 'pending_verification' ? '/welcome/doctor' : '/welcome';
  }
  return '/app';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
