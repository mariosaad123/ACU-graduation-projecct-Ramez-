import {
  notificationSettingsSchema,
  notificationsResponseSchema,
  unreadNotificationsSchema,
  type NotificationSettings,
} from '@acu/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as z from 'zod/mini';
import { apiRequest } from '../../lib/api';

const NOTIFICATIONS_KEY = ['notifications'] as const;
const UNREAD_KEY = ['notifications', 'unread'] as const;
const SETTINGS_KEY = ['notifications', 'settings'] as const;

/** How often the bell asks whether something new arrived, while the page is visible. */
const UNREAD_POLL_MS = 30_000;

const settingsResponse = z.object({
  settings: notificationSettingsSchema,
  push: z.object({ available: z.boolean(), devices: z.number() }),
});

export function useUnreadNotifications(enabled: boolean) {
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: async () =>
      (await apiRequest('/api/notifications/unread', { schema: unreadNotificationsSchema })).unread,
    enabled,
    refetchInterval: UNREAD_POLL_MS,
  });
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'list'],
    queryFn: () => apiRequest('/api/notifications', { schema: notificationsResponseSchema }),
    enabled,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (target: { ids: string[] } | { all: true }) =>
      apiRequest('/api/notifications/read', { method: 'POST', body: target }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => apiRequest('/api/notifications/settings', { schema: settingsResponse }),
  });
}

export function useSaveNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: NotificationSettings) =>
      apiRequest('/api/notifications/settings', { method: 'PUT', body: settings }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useRefreshNotificationSettings() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
}
